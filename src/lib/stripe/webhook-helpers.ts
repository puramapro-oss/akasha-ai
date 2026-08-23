import { createServiceClient } from '@/lib/supabase'
import { PRIME_J1_AMOUNT } from './webhook-constants'

export async function updateProfileByCustomer(customerId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  await db.from('profiles').update(data).eq('stripe_customer_id', customerId)
}

export async function updateProfileById(userId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  await db.from('profiles').update(data).eq('id', userId)
}

/**
 * V7 SUPREME §20 — Crédite la prime J+1 (25 €) sur le wallet Purama.
 * Idempotent : vérifie qu'aucune prime_j1 n'a déjà été versée à cet user.
 */
export async function creditPrimeJ1(userId: string, sessionId: string, promoSource: string | null) {
  const db = createServiceClient()

  // 1) Assurer l'existence du wallet (upsert)
  const { data: wallet } = await db
    .from('wallets')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('id, balance, total_earned')
    .single()

  if (!wallet) {
    console.error('[webhook] wallet upsert failed for', userId)
    return
  }

  // 2) Idempotence — vérifier qu'on n'a pas déjà versé prime_j1 pour cette session
  const { data: existing } = await db
    .from('wallet_transactions')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('type', 'prime_j1')
    .ilike('description', `%${sessionId}%`)
    .limit(1)
    .maybeSingle()

  if (existing) return

  // 3) Insert la transaction et mettre à jour le solde
  const description = promoSource
    ? `Prime J+1 Purama — cross-promo ${promoSource} (session ${sessionId})`
    : `Prime J+1 Purama (session ${sessionId})`

  await db.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    amount: PRIME_J1_AMOUNT,
    type: 'prime_j1',
    description,
  })

  await db
    .from('wallets')
    .update({
      balance: Number(wallet.balance ?? 0) + PRIME_J1_AMOUNT,
      total_earned: Number(wallet.total_earned ?? 0) + PRIME_J1_AMOUNT,
    })
    .eq('id', wallet.id)
}

/**
 * V7 SUPREME §15 — Marque la conversion cross-promo.
 */
export async function trackCrossPromoConversion(userId: string, coupon: string, source: string) {
  const db = createServiceClient()
  await db
    .from('cross_promos')
    .update({ converted: true, user_id: userId, coupon_used: coupon })
    .eq('source_app', source)
    .eq('target_app', 'akasha_ai')
    .is('user_id', null)
    .eq('coupon_code', coupon)
}
