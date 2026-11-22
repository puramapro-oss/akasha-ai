import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { SHOP_ITEMS } from '@/lib/points/shop-catalog'
import { z } from 'zod'

const RedeemSchema = z.object({
  item_id: z.string().min(1).max(80),
  cost: z.number().int().positive(),
  request_id: z.uuid(),
  expected_user_id: z.uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body: unknown = await request.json()
    const parsed = RedeemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 })
    }

    // The cookie may have changed in another tab before this view is notified.
    if (parsed.data.expected_user_id !== user.id) {
      return NextResponse.json({ error: 'La session a changé. Actualise la boutique avant de confirmer.' }, { status: 409 })
    }

    const { item_id, cost, request_id } = parsed.data
    const item = SHOP_ITEMS.find(candidate => candidate.id === item_id)
    if (!item) return NextResponse.json({ error: 'Article indisponible.' }, { status: 400 })
    if (!item.available) return NextResponse.json({ error: 'Cette récompense n’est pas encore disponible. Aucun point débité.' }, { status: 503 })
    if (cost !== item.cost_points) {
      return NextResponse.json({ error: 'Le prix de cet article a changé. Actualise la boutique.' }, { status: 409 })
    }

    // Claim atomique : l'UPDATE `WHERE balance >= p_cost` du RPC est
    // lui-meme le verrou (verrouillage de ligne Postgres implicite), plus
    // de check-then-act SELECT->compare->UPDATE (qui permettait un double
    // achat + lost update sous concurrence, cf audit red-team R1).
    const { data: rpcData, error: rpcError } = await createServiceClient().rpc('redeem_points_reward', {
      p_user_id: user.id,
      p_cost: item.cost_points,
      p_item_id: item_id,
      p_request_id: request_id,
    })

    if (rpcError) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const result = Array.isArray(rpcData) && rpcData.length === 1 ? rpcData[0] : rpcData
    if (!result || typeof result.success !== 'boolean') {
      return NextResponse.json({ error: 'Confirmation de l’échange indisponible.' }, { status: 500 })
    }
    if (!result.success) {
      if (result.reason === 'unavailable') return NextResponse.json({ error: 'Récompense indisponible. Aucun point débité.' }, { status: 503 })
      if (result.reason === 'no_draw') return NextResponse.json({ error: 'Aucun tirage ouvert. Aucun point débité.' }, { status: 409 })
      if (result.reason === 'price_changed') return NextResponse.json({ error: 'Le prix a changé. Actualise la boutique.' }, { status: 409 })
      return NextResponse.json({ error: 'Solde insuffisant pour cet article.' }, { status: 400 })
    }
    if (!Number.isSafeInteger(result.new_balance) || result.new_balance < 0
      || result.fulfilled !== true || result.request_id !== request_id || result.user_id !== user.id
      || result.item_id !== item_id || result.cost_points !== item.cost_points
      || typeof result.purchase_id !== 'string' || !result.purchase_id) {
      return NextResponse.json({ error: 'Confirmation du solde indisponible.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user_id: user.id,
      new_balance: result.new_balance,
      item_id,
      request_id,
      fulfilled: true,
      purchase_id: result.purchase_id,
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
