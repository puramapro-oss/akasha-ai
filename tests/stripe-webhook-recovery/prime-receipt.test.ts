import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown },
  calls: [] as Array<{ name: string; args: unknown }> }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => ({
  rpc: async (name: string, args: unknown) => { fixture.calls.push({ name, args }); return fixture.result },
}) }))
import { creditPrimeJ1 } from '../../src/lib/stripe/webhook-helpers'

const user = '00000000-0000-4000-8000-000000000001'
const namespace = { stripe_account_key: 'platform', livemode: false }
const valid = { version: 1, status: 'credited', ...namespace, checkout_session_id: 'cs_receipt',
  user_id: user, promo_source: null, amount: 25, currency: 'eur',
  wallet_id: 'wallet_receipt', transaction_id: 'transaction_receipt', balance_after: 25, total_earned_after: 25 }
beforeEach(() => { fixture.result = { data: { ...valid }, error: null }; fixture.calls.length = 0 })
const invoke = () => creditPrimeJ1(user, 'cs_receipt', null, namespace)

describe('prime helper validates a durable financial receipt', () => {
  for (const status of ['credited', 'already_credited']) {
    it('accepts an explicit ' + status + ' receipt from the atomic RPC', async () => {
      fixture.result.data = { ...valid, status }
      await expect(invoke()).resolves.toBeUndefined()
      expect(fixture.calls).toEqual([{ name: 'credit_checkout_prime_j1', args: {
        p_stripe_account_key: 'platform', p_livemode: false, p_checkout_session_id: 'cs_receipt',
        p_user_id: user, p_amount: 25, p_currency: 'eur', p_promo_source: null,
      } }])
    })
  }
  for (const [field, value] of [
    ['version', 2], ['status', 'pending'], ['stripe_account_key', 'acct_other'], ['livemode', true],
    ['checkout_session_id', 'cs_other'], ['user_id', 'other-beneficiary'], ['promo_source', 'other-promo'],
    ['amount', 26], ['currency', 'usd'], ['wallet_id', ''], ['transaction_id', ''],
    ['balance_after', 'NaN'], ['total_earned_after', null],
  ] as const) {
    it('refuses inconsistent receipt field ' + field, async () => {
      fixture.result.data = { ...valid, [field]: value }
      await expect(invoke()).rejects.toThrow()
      expect(fixture.calls).toHaveLength(1)
    })
  }
  it('does not treat an absent RPC or uncertain database response as a credit confirmation', async () => {
    fixture.result = { data: null, error: { code: '08006' } }
    await expect(invoke()).rejects.toThrow('not confirmed')
    expect(fixture.calls).toHaveLength(1)
  })
})
