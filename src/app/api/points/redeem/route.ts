import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'

const RedeemSchema = z.object({
  item_id: z.string().min(1),
  cost: z.number().positive(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body: unknown = await request.json()
    const parsed = RedeemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 })
    }

    const { item_id, cost } = parsed.data

    // Claim atomique : l'UPDATE `WHERE balance >= p_cost` du RPC est
    // lui-meme le verrou (verrouillage de ligne Postgres implicite), plus
    // de check-then-act SELECT->compare->UPDATE (qui permettait un double
    // achat + lost update sous concurrence, cf audit red-team R1).
    const { data: rpcData, error: rpcError } = await supabase.rpc('redeem_points', {
      p_user_id: user.id,
      p_cost: cost,
      p_item_id: item_id,
    })

    if (rpcError) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (!result?.success) {
      return NextResponse.json({ error: 'Solde insuffisant pour cet article.' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      new_balance: result.new_balance,
      item_id,
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
