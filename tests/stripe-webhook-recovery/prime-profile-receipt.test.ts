import { beforeEach, expect, it, vi } from 'vitest'
import { checkoutProfileIntentSha256 } from '../../src/lib/stripe/checkout-profile-intent'

const fixture = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown },
  calls: [] as Array<{ name: string; args: unknown }> }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => ({
  rpc: async (name: string, args: unknown) => { fixture.calls.push({ name, args }); return fixture.result },
}) }))
import { completeCheckoutPrimeJ1 } from '../../src/lib/stripe/webhook-helpers'

const user = '00000000-0000-4000-8000-000000000001'
const namespace = { stripe_account_key: 'platform', livemode: false }
const intent = { customerId: 'cus_receipt', subscriptionId: 'sub_receipt', plan: null, tier: null }
const valid = { version: 1, status: 'credited', ...namespace, checkout_session_id: 'cs_receipt',
  user_id: user, promo_source: null, amount: 25, currency: 'eur', wallet_id: 'wallet_receipt',
  transaction_id: 'transaction_receipt', balance_after: 25, total_earned_after: 25,
  profile_intent_version: 1, profile_intent_sha256: checkoutProfileIntentSha256(intent) }
beforeEach(() => { fixture.result = { data: { ...valid }, error: null }; fixture.calls.length = 0 })
const invoke = () => completeCheckoutPrimeJ1(user, 'cs_receipt', null, namespace, intent)

for (const status of ['credited', 'already_credited']) {
  it('confirms profile and prime only from a bound ' + status + ' receipt', async () => {
    fixture.result.data = { ...valid, status }
    await expect(invoke()).resolves.toBeUndefined()
    expect(fixture.calls).toEqual([{ name: 'complete_checkout_prime_j1', args: {
      p_stripe_account_key: 'platform', p_livemode: false, p_checkout_session_id: 'cs_receipt',
      p_user_id: user, p_amount: 25, p_currency: 'eur', p_promo_source: null,
      p_customer_id: 'cus_receipt', p_subscription_id: 'sub_receipt', p_plan: null, p_plan_tier: null,
    } }])
  })
}

for (const [field, value] of [
  ['profile_intent_version', undefined], ['profile_intent_version', 2],
  ['profile_intent_sha256', undefined], ['profile_intent_sha256', '0'.repeat(64)],
  ['profile_intent_sha256', checkoutProfileIntentSha256({ ...intent, subscriptionId: 'sub_other' })],
  ['amount', 26], ['user_id', 'other-user'],
] as const) {
  it('does not acknowledge an unbound completion field ' + field + ':' + value, async () => {
    fixture.result.data = { ...valid, [field]: value }
    await expect(invoke()).rejects.toThrow('not confirmed')
    expect(fixture.calls).toHaveLength(1)
  })
}

it('does not retry or fall back to separate writes when the completion RPC is unavailable', async () => {
  fixture.result = { data: null, error: { code: '42883' } }
  await expect(invoke()).rejects.toThrow('not confirmed')
  expect(fixture.calls).toHaveLength(1)
})
