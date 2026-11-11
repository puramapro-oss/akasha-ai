import { createServiceClient } from '@/lib/supabase'
import type { StripeWebhookIdentity } from '@/lib/webhook-idempotency'
import { PRIME_J1_AMOUNT } from './webhook-constants'
import { checkoutProfileIntentSha256, type CheckoutProfileIntent } from './checkout-profile-intent'

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
 * The event journal deduplicates deliveries; this atomic RPC deduplicates the
 * prime itself by authenticated account/mode and Checkout Session. Its receipt
 * proves the transaction and balance update committed together. Unreceipted
 * historical transactions remain ambiguous and are never adopted as success.
 * Legacy financial helper: the profile-completion migration revokes its RPC
 * from application roles. Checkout handlers must use completeCheckoutPrimeJ1.
 */
export async function creditPrimeJ1(
  userId: string, sessionId: string, promoSource: string | null,
  namespace: Pick<StripeWebhookIdentity, 'stripe_account_key' | 'livemode'>,
) {
  const db = createServiceClient()
  const result = await db.rpc('credit_checkout_prime_j1', {
    p_stripe_account_key: namespace.stripe_account_key, p_livemode: namespace.livemode,
    p_checkout_session_id: sessionId, p_user_id: userId,
    p_amount: PRIME_J1_AMOUNT, p_currency: 'eur', p_promo_source: promoSource,
  })
  confirmPrimeReceipt(result, userId, sessionId, promoSource, namespace)
}

function confirmPrimeReceipt(
  result: { data: unknown; error: unknown }, userId: string, sessionId: string, promoSource: string | null,
  namespace: Pick<StripeWebhookIdentity, 'stripe_account_key' | 'livemode'>,
) {
  const receipt = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? result.data as Record<string, unknown> : null
  if (result.error || !receipt || receipt.version !== 1
      || !['credited', 'already_credited'].includes(String(receipt.status))
      || receipt.stripe_account_key !== namespace.stripe_account_key
      || receipt.livemode !== namespace.livemode || receipt.checkout_session_id !== sessionId
      || receipt.user_id !== userId || receipt.currency !== 'eur' || receipt.promo_source !== promoSource
      || !confirmedId({ id: receipt.wallet_id }) || !confirmedId({ id: receipt.transaction_id })
      || finiteBalance(receipt.amount) !== PRIME_J1_AMOUNT) {
    throw new Error('Atomic prime receipt was not confirmed')
  }
  finiteBalance(receipt.balance_after)
  finiteBalance(receipt.total_earned_after)
  return receipt
}

/** Profile + prime commit together; a matching replay confirms without a profile write. */
export async function completeCheckoutPrimeJ1(
  userId: string, sessionId: string, promoSource: string | null,
  namespace: Pick<StripeWebhookIdentity, 'stripe_account_key' | 'livemode'>,
  intent: CheckoutProfileIntent,
) {
  const db = createServiceClient()
  const result = await db.rpc('complete_checkout_prime_j1', {
    p_stripe_account_key: namespace.stripe_account_key, p_livemode: namespace.livemode,
    p_checkout_session_id: sessionId, p_user_id: userId,
    p_amount: PRIME_J1_AMOUNT, p_currency: 'eur', p_promo_source: promoSource,
    p_customer_id: intent.customerId, p_subscription_id: intent.subscriptionId,
    p_plan: intent.plan, p_plan_tier: intent.tier,
  })
  const receipt = confirmPrimeReceipt(result, userId, sessionId, promoSource, namespace)
  if (receipt.profile_intent_version !== 1 || receipt.profile_intent_sha256 !== checkoutProfileIntentSha256(intent)) {
    throw new Error('Atomic profile and prime receipt was not confirmed')
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
