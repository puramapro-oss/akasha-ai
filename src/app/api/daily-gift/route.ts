import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

function rollGift(streakCount: number): { gift_type: string; gift_value: string; label: string } {
  const roll = Math.random() * 100
  const hasStreak7 = streakCount >= 7

  if (hasStreak7 && roll < 2) {
    return { gift_type: 'coupon', gift_value: '50', label: '-50% pendant 24h' }
  }
  if (roll < 5) {
    return { gift_type: 'points', gift_value: String(Math.floor(Math.random() * 51) + 50), label: '50-100 points bonus' }
  }
  if (roll < 10) {
    return { gift_type: 'coupon', gift_value: '20', label: '-20% pendant 3 jours' }
  }
  if (roll < 20) {
    return { gift_type: 'credits', gift_value: '3', label: '+3 credits' }
  }
  if (roll < 35) {
    return { gift_type: 'ticket', gift_value: '1', label: '1 ticket tirage' }
  }
  if (roll < 60) {
    const discount = hasStreak7 ? Math.max(10, Math.floor(Math.random() * 6) + 5) : Math.floor(Math.random() * 6) + 5
    return { gift_type: 'coupon', gift_value: String(discount), label: `-${discount}% pendant 7 jours` }
  }
  const pts = Math.floor(Math.random() * 16) + 5
  return { gift_type: 'points', gift_value: String(pts), label: `${pts} points` }
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) return null
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'akasha_ai' } })
  const { data: { user }, error } = await auth.auth.getUser(header.slice(7))
  return error ? null : user
}

function labelForGift(gift: { gift_type: string; gift_value: string }) {
  const value = Number(gift.gift_value)
  if (gift.gift_type === 'points') return '+' + value + ' points'
  if (gift.gift_type === 'credits') return '+' + value + ' credits'
  if (gift.gift_type === 'ticket') return value + ' ticket tirage'
  return '-' + value + '% pendant ' + (value >= 50 ? '24h' : value >= 20 ? '3 jours' : '7 jours')
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const supabase = createServiceClient()
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    const [claimed, streakResult] = await Promise.all([
      supabase.from('daily_gifts').select('*').eq('user_id', user.id)
        .gte('opened_at', start.toISOString()).lt('opened_at', end.toISOString()).maybeSingle(),
      supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
    ])
    if (claimed.error || streakResult.error) {
      return NextResponse.json({ error: 'Impossible de verifier le coffre. Reessaie.' }, { status: 503 })
    }
    if (claimed.data && !claimed.data.fulfilled_at && claimed.data.delivery_status !== 'pending_coupon_activation') {
      return NextResponse.json({ error: 'Ce cadeau anterieur doit etre verifie avant une nouvelle attribution.' }, { status: 409 })
    }
    return NextResponse.json({ already_opened: !!claimed.data,
      gift: claimed.data ? { ...claimed.data, label: labelForGift(claimed.data) } : null,
      streak: streakResult.data?.current_streak ?? 0 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const supabase = createServiceClient()
    const { data: streakData, error: streakError } = await supabase.from('streaks')
      .select('current_streak').eq('user_id', user.id).maybeSingle()
    const streak = streakData?.current_streak ?? 0
    if (streakError || !Number.isSafeInteger(streak) || streak < 0) {
      return NextResponse.json({ error: 'Impossible de verifier la serie. Reessaie.' }, { status: 503 })
    }
    // Keep the existing draw distribution. The database commits the claim and every reward together.
    const gift = rollGift(streak)
    const { data, error } = await supabase.rpc('claim_daily_gift', {
      p_user_id: user.id, p_gift_type: gift.gift_type, p_gift_value: Number(gift.gift_value), p_streak_count: streak,
    })
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({
        error: 'Ce cadeau anterieur doit etre verifie avant une nouvelle attribution.',
      }, { status: 409 })
      return NextResponse.json({ error: "La remise du cadeau n'a pas ete confirmee. Reessaie." }, { status: 503 })
    }
    const saved = data?.gift
    const pendingCoupon = saved?.gift_type === 'coupon' && saved.delivery_status === 'pending_coupon_activation'
      && typeof saved.delivery_details?.code === 'string' && saved.delivery_details.code.length > 0
    if (!saved || typeof saved.id !== 'string' || saved.user_id !== user.id || (!saved.fulfilled_at && !pendingCoupon)
      || !['points', 'coupon', 'ticket', 'credits'].includes(saved.gift_type)
      || typeof saved.gift_value !== 'string' || !Number.isSafeInteger(Number(saved.gift_value))
      || Number(saved.gift_value) <= 0 || typeof data.replayed !== 'boolean') {
      return NextResponse.json({ error: 'Confirmation du cadeau invalide. Reessaie.' }, { status: 503 })
    }
    return NextResponse.json({ gift: { ...saved, label: labelForGift(saved) },
      streak: saved.streak_count, replayed: data.replayed }, { status: pendingCoupon ? 202 : 200 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
