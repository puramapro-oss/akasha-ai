import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import type { PGlite } from '@electric-sql/pglite'
import { createPrimeDatabase, primeSqlBridge, resetPrimeDatabase, USER_ONE, USER_TWO } from './prime-fixture'

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
beforeAll(async () => {
  database = await createPrimeDatabase()
  await resetPrimeDatabase(database)
  fixture.bridge = primeSqlBridge(database)
  fixture.stripe = new Stripe('sk_test_profile_boundary_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_profile_boundary_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
  vi.stubGlobal('fetch', () => { fixture.networkAttempts++; throw new Error('Network forbidden') })
}, 15000)
afterAll(async () => {
  expect(fixture.networkAttempts).toBe(0)
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
  await database?.close()
})

async function deliver(eventId: string, userId: string) {
  const payload = JSON.stringify({ id: eventId, object: 'event', type: 'checkout.session.completed',
    created: 1794390000, livemode: false, api_version: '2026-03-25.dahlia',
    data: { object: { id: 'cs_synthetic_profile_boundary', object: 'checkout.session',
      customer: 'cus_synthetic_prime', subscription: 'sub_synthetic_prime', metadata: { user_id: userId } } } })
  const signature = fixture.stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  return POST(new NextRequest('http://fixture.invalid/webhook',
    { method: 'POST', headers: { 'stripe-signature': signature }, body: payload }))
}

it('characterizes the existing profile mutation before a conflicting prime is rejected', async () => {
  expect((await deliver('evt_prime_profile_first', USER_ONE)).status).toBe(200)
  const profile = () => database.query(`SELECT stripe_customer_id, stripe_subscription_id
    FROM akasha_ai.profiles WHERE id=$1`, [USER_TWO])
  expect((await profile()).rows).toEqual([
    { stripe_customer_id: 'cus_synthetic_prime_other', stripe_subscription_id: null },
  ])
  expect((await deliver('evt_prime_profile_conflict', USER_TWO)).status).toBe(503)
  // This is a known pre-existing boundary, not a guarantee of no checkout effects.
  expect((await profile()).rows).toEqual([
    { stripe_customer_id: 'cus_synthetic_prime', stripe_subscription_id: 'sub_synthetic_prime' },
  ])
  expect((await database.query('SELECT id FROM akasha_ai.wallets WHERE user_id=$1', [USER_TWO])).rows).toHaveLength(0)
  expect((await database.query('SELECT amount FROM akasha_ai.wallet_transactions')).rows).toEqual([{ amount: '25.00' }])
  expect((await database.query('SELECT balance, total_earned FROM akasha_ai.wallets')).rows)
    .toEqual([{ balance: '25.00', total_earned: '25.00' }])
})
