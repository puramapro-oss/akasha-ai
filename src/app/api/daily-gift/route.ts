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

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: 'akasha_ai' } }
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Check today's gift
    const today = new Date().toISOString().split('T')[0]
    const { data: existingGift } = await supabase
      .from('daily_gifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('opened_at', `${today}T00:00:00`)
      .lte('opened_at', `${today}T23:59:59`)
      .maybeSingle()

    // Get streak
    const { data: streakData } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .single()

    const streak = streakData?.current_streak ?? 0

    return NextResponse.json({
      already_opened: !!existingGift,
      gift: existingGift ?? null,
      streak,
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: 'akasha_ai' } }
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Check informatif rapide (évite un aller-retour DB évident) — le VRAI
    // verrou anti-course est la contrainte UNIQUE(user_id, gift_date) posée
    // par l'INSERT ci-dessous (migration 20260926). Ce check seul ne
    // suffit pas : 2 requêtes concurrentes le passent toutes les deux
    // (check-then-act classique, cf R1 red team 2026-09-26).
    const today = new Date().toISOString().split('T')[0]
    const { data: existingGift } = await supabase
      .from('daily_gifts')
      .select('id')
      .eq('user_id', user.id)
      .gte('opened_at', `${today}T00:00:00`)
      .lte('opened_at', `${today}T23:59:59`)
      .maybeSingle()

    if (existingGift) {
      return NextResponse.json({ error: 'Tu as deja ouvert ton coffre aujourd hui' }, { status: 400 })
    }

    // Get streak
    const { data: streakData } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .single()

    const streak = streakData?.current_streak ?? 0
    const gift = rollGift(streak)

    // CLAIM ATOMIQUE — cet INSERT doit réussir (contrainte UNIQUE sur
    // (user_id, gift_date), gift_date = DEFAULT now()::date côté DB) AVANT
    // tout octroi de récompense. Sous course concurrente, l'un des deux
    // appels reçoit une violation 23505 ici et n'a alors RIEN crédité.
    const { data: savedGift, error: saveError } = await supabase
      .from('daily_gifts')
      .insert({
        user_id: user.id,
        gift_type: gift.gift_type,
        gift_value: gift.gift_value,
        streak_count: streak,
      })
      .select()
      .single()

    if (saveError) {
      if (saveError.code === '23505') {
        return NextResponse.json({ error: 'Tu as deja ouvert ton coffre aujourd hui' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Impossible de sauvegarder le cadeau' }, { status: 500 })
    }

    // Apply gift (claim déjà acquis, 0 risque de double-crédit à partir d'ici)
    if (gift.gift_type === 'points') {
      const amount = parseInt(gift.gift_value)
      await supabase.from('point_transactions').insert({
        user_id: user.id,
        amount,
        type: 'daily_gift',
        description: `Coffre quotidien : +${amount} points`,
      })
      // Upsert points balance
      const { data: existing } = await supabase
        .from('purama_points')
        .select('balance, lifetime_earned')
        .eq('user_id', user.id)
        .maybeSingle()

      if (existing) {
        await supabase.from('purama_points').update({
          balance: existing.balance + amount,
          lifetime_earned: existing.lifetime_earned + amount,
        }).eq('user_id', user.id)
      } else {
        await supabase.from('purama_points').insert({
          user_id: user.id,
          balance: amount,
          lifetime_earned: amount,
        })
      }
    } else if (gift.gift_type === 'coupon') {
      const expiresAt = new Date()
      const discount = parseInt(gift.gift_value)
      if (discount >= 50) expiresAt.setDate(expiresAt.getDate() + 1)
      else if (discount >= 20) expiresAt.setDate(expiresAt.getDate() + 3)
      else expiresAt.setDate(expiresAt.getDate() + 7)

      await supabase.from('user_coupons').insert({
        user_id: user.id,
        code: `DAILY${discount}-${Date.now().toString(36).toUpperCase()}`,
        discount_percent: discount,
        source: 'daily',
        expires_at: expiresAt.toISOString(),
      })
    } else if (gift.gift_type === 'ticket') {
      // Get upcoming draw
      const { data: draw } = await supabase
        .from('lottery_draws')
        .select('id')
        .eq('status', 'upcoming')
        .order('draw_date', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (draw) {
        await supabase.from('lottery_tickets').insert({
          user_id: user.id,
          draw_id: draw.id,
          source: 'daily_gift',
        })
      }
    } else if (gift.gift_type === 'credits') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single()
      const currentCredits = prof?.credits ?? 0
      await supabase
        .from('profiles')
        .update({ credits: currentCredits + parseInt(gift.gift_value) })
        .eq('id', user.id)
    }

    return NextResponse.json({
      gift: { ...savedGift, label: gift.label },
      streak,
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
