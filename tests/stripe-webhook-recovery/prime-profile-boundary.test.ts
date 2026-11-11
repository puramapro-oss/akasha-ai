import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import type { PGlite } from '@electric-sql/pglite'
import { createPrimeDatabase, primeSqlBridge, resetPrimeDatabase, USER_ONE, USER_TWO, type Values } from './prime-fixture'

const fixture = vi.hoisted(() => ({ bridge: null as unknown as ReturnType<typeof primeSqlBridge>,
  stripe: null as unknown as Stripe, networkAttempts: 0 }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => fixture.bridge }))
vi.mock('@/lib/supabase-public', () => ({ createPublicServiceClient: () => { throw new Error('Unexpected public DB') } }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => fixture.stripe }))
vi.mock('@/lib/stripe/connect', () => ({ syncConnectAccount: () => { throw new Error('Unexpected Connect') } }))
vi.mock('@/lib/karma/dispatch', () => ({ dispatchKarmaSplit: () => { throw new Error('Unexpected KARMA') } }))
import { POST } from '../../src/app/api/stripe/webhook/route'

const SECRET = 'whsec_profile_boundary_inert_fixture_no_real_secret'
let database: PGlite
beforeAll(async () => { database = await createPrimeDatabase() }, 15000)
beforeEach(async () => {
  await resetPrimeDatabase(database)
  fixture.bridge = primeSqlBridge(database)
  fixture.stripe = new Stripe('sk_test_profile_boundary_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_profile_boundary_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
  vi.stubGlobal('fetch', () => { fixture.networkAttempts++; throw new Error('Network forbidden') })
})
afterEach(() => {
  expect(fixture.networkAttempts).toBe(0)
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
afterAll(async () => { await database?.close() })

async function deliver(eventId: string, userId = USER_ONE, changes: Values = {}) {
  const payload = JSON.stringify({ id: eventId, object: 'event', type: 'checkout.session.completed',
    created: 1794390000, livemode: false, api_version: '2026-03-25.dahlia',
    data: { object: { id: 'cs_synthetic_profile_boundary', object: 'checkout.session',
      customer: 'cus_synthetic_prime', subscription: 'sub_synthetic_prime',
      metadata: { user_id: userId, plan: 'plus', tier: 'essential' }, ...changes } } })
  const signature = fixture.stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  return POST(new NextRequest('http://fixture.invalid/webhook',
    { method: 'POST', headers: { 'stripe-signature': signature }, body: payload }))
}

async function profile(userId = USER_ONE) {
  return (await database.query(`SELECT stripe_customer_id, stripe_subscription_id, plan, plan_tier,
    subscription_started_at::text FROM akasha_ai.profiles WHERE id=$1`, [userId])).rows
}

async function financialState() {
  await database.exec('RESET ROLE')
  try {
    return (await database.query(`SELECT
      (SELECT count(*)::integer FROM akasha_ai.wallet_transactions) AS transactions,
      (SELECT count(*)::integer FROM akasha_ai.checkout_prime_j1_receipts) AS receipts,
      coalesce(sum(balance), 0)::text AS balance FROM akasha_ai.wallets`)).rows[0]
  } finally { await database.exec('SET ROLE service_role') }
}

it('rejects another beneficiary without modifying that profile', async () => {
  expect((await deliver('evt_prime_profile_first', USER_ONE)).status).toBe(200)
  const before = await profile(USER_TWO)
  expect((await deliver('evt_prime_profile_conflict', USER_TWO)).status).toBe(503)
  expect(await profile(USER_TWO)).toEqual(before)
  expect((await database.query('SELECT id FROM akasha_ai.wallets WHERE user_id=$1', [USER_TWO])).rows).toHaveLength(0)
  expect((await database.query('SELECT amount FROM akasha_ai.wallet_transactions')).rows).toEqual([{ amount: '25.00' }])
  expect((await database.query('SELECT balance, total_earned FROM akasha_ai.wallets')).rows)
    .toEqual([{ balance: '25.00', total_earned: '25.00' }])
})

for (const [field, changes] of [
  ['customer', { customer: 'cus_synthetic_changed' }],
  ['subscription', { subscription: 'sub_synthetic_changed' }],
  ['plan', { metadata: { user_id: USER_ONE, plan: 'premium', tier: 'essential' } }],
  ['tier', { metadata: { user_id: USER_ONE, plan: 'plus', tier: 'advanced' } }],
] as const) {
  it('rejects a different profile intention for ' + field + ' on the same Session', async () => {
    expect((await deliver('evt_profile_intent_first')).status).toBe(200)
    const before = await profile()
    expect((await deliver('evt_profile_intent_changed', USER_ONE, changes)).status).toBe(503)
    expect(await profile()).toEqual(before)
    expect(await financialState()).toEqual({ transactions: 1, receipts: 1, balance: '25.00' })
  })
}

it('acknowledges an exact new-Event replay without resetting a more recent subscription', async () => {
  expect((await deliver('evt_profile_replay_first')).status).toBe(200)
  await database.query(`UPDATE akasha_ai.profiles SET stripe_subscription_id='sub_synthetic_later',
    plan='premium', plan_tier='advanced', subscription_started_at='2040-01-01T00:00:00Z' WHERE id=$1`, [USER_ONE])
  const later = await profile()
  expect((await deliver('evt_profile_replay_later')).status).toBe(200)
  expect(await profile()).toEqual(later)
  expect(await financialState()).toEqual({ transactions: 1, receipts: 1, balance: '25.00' })
})

for (const [target, operation, triggerBody] of [
  ['profiles', 'UPDATE', "RAISE EXCEPTION 'inert profile failure';"],
  ['profiles', 'UPDATE', 'RETURN NULL;'],
  ['wallets', 'UPDATE', "RAISE EXCEPTION 'inert wallet failure';"],
  ['checkout_prime_j1_receipts', 'INSERT', "RAISE EXCEPTION 'inert receipt failure';"],
] as const) {
  it('rolls back profile and prime on ' + target + ' ' + triggerBody, async () => {
    const before = await profile()
    await database.exec(`RESET ROLE;
      CREATE FUNCTION akasha_ai.profile_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN ${triggerBody} END $$;
      CREATE TRIGGER profile_fixture_failure BEFORE ${operation} ON akasha_ai.${target}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.profile_fixture_failure(); SET ROLE service_role;`)
    try {
      expect((await deliver('evt_profile_failure')).status).toBe(503)
      expect(await profile()).toEqual(before)
      expect(await financialState()).toEqual({ transactions: 0, receipts: 0, balance: '0' })
    } finally {
      await database.exec(`RESET ROLE; DROP TRIGGER profile_fixture_failure ON akasha_ai.${target};
        DROP FUNCTION akasha_ai.profile_fixture_failure(); SET ROLE service_role;`)
    }
  })
}

it('keeps a committed profile and prime together after a lost RPC response, without automatic replay', async () => {
  const originalRpc = fixture.bridge.rpc
  let committedCalls = 0
  fixture.bridge.rpc = async (name, args) => {
    const result = await originalRpc(name, args)
    if (['credit_checkout_prime_j1', 'complete_checkout_prime_j1'].includes(name) && !result.error) {
      committedCalls++
      return { data: null, error: { message: 'inert response lost after SQL commit' } }
    }
    return result
  }
  expect((await deliver('evt_profile_lost_ack')).status).toBe(503)
  expect((await profile())[0]).toMatchObject({ stripe_subscription_id: 'sub_synthetic_prime' })
  expect(await financialState()).toEqual({ transactions: 1, receipts: 1, balance: '25.00' })
  const committed = await profile()
  expect((await deliver('evt_profile_lost_ack')).status).toBe(503)
  expect(await profile()).toEqual(committed)
  expect(await financialState()).toEqual({ transactions: 1, receipts: 1, balance: '25.00' })
  expect(committedCalls).toBe(1)
})
