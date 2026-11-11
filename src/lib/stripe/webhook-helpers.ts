import { createServiceClient } from '@/lib/supabase'
import { PRIME_J1_AMOUNT } from './webhook-constants'

function confirmedId(value: unknown): value is { id: string } {
  return !!value && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string'
    && (value as { id: string }).id.length > 0
}

function finiteBalance(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string')
      || String(value).trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error('Wallet balance was not confirmed')
  }
  return Number(value)
}

export async function updateProfileByCustomer(customerId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  const result = await db.from('profiles').update(data).eq('stripe_customer_id', customerId)
    .select('id, stripe_customer_id').single()
  if (result.error || !confirmedId(result.data) || result.data.stripe_customer_id !== customerId) {
    throw new Error('Customer profile update was not confirmed')
  }
}

export async function updateProfileById(userId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  const result = await db.from('profiles').update(data).eq('id', userId).select('id').single()
  if (result.error || !confirmedId(result.data) || result.data.id !== userId) {
    throw new Error('Profile update was not confirmed')
  }
}

/**
 * Legacy prime effect, still non-atomic across its writes.
 * The common event journal prevents automatic replay after an uncertain write.
 * A pre-existing descriptive transaction is not proof that its balance update
 * completed: that ambiguous history requires reconciliation, not a fresh credit.
 */
export async function creditPrimeJ1(userId: string, sessionId: string, promoSource: string | null) {
  const db = createServiceClient()
  const walletResult = await db.from('wallets')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('id, balance, total_earned').single()
  if (walletResult.error || !confirmedId(walletResult.data)) {
    throw new Error('Wallet creation was not confirmed')
  }
  const wallet = walletResult.data
  const balance = finiteBalance(wallet.balance)
  const totalEarned = finiteBalance(wallet.total_earned)
  const existing = await db.from('wallet_transactions').select('id')
    .eq('wallet_id', wallet.id).eq('type', 'prime_j1')
    .ilike('description', '%' + sessionId + '%').limit(1).maybeSingle()
  if (existing.error) throw new Error('Prime history lookup failed')
  if (existing.data !== null) throw new Error('Existing prime history requires reconciliation')

  const description = promoSource
    ? 'Prime J+1 Purama — cross-promo ' + promoSource + ' (session ' + sessionId + ')'
    : 'Prime J+1 Purama (session ' + sessionId + ')'
  const inserted = await db.from('wallet_transactions').insert({
    wallet_id: wallet.id, amount: PRIME_J1_AMOUNT, type: 'prime_j1', description,
  }).select('id').single()
  if (inserted.error || !confirmedId(inserted.data)) {
    throw new Error('Prime transaction was not confirmed')
  }
  const updated = await db.from('wallets').update({
    balance: balance + PRIME_J1_AMOUNT, total_earned: totalEarned + PRIME_J1_AMOUNT,
  }).eq('id', wallet.id).select('id, balance, total_earned').single()
  if (updated.error || !confirmedId(updated.data) || updated.data.id !== wallet.id
      || finiteBalance(updated.data.balance) !== balance + PRIME_J1_AMOUNT
      || finiteBalance(updated.data.total_earned) !== totalEarned + PRIME_J1_AMOUNT) {
    throw new Error('Prime balance update was not confirmed')
  }
}

export async function trackCrossPromoConversion(userId: string, coupon: string, source: string) {
  const db = createServiceClient()
  const result = await db.from('cross_promos')
    .update({ converted: true, user_id: userId, coupon_used: coupon })
    .eq('source_app', source).eq('target_app', 'akasha_ai')
    .is('user_id', null).eq('coupon_code', coupon).select('id').single()
  if (result.error || !confirmedId(result.data)) {
    throw new Error('Cross-promo conversion was not confirmed')
  }
}
