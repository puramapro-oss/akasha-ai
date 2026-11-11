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

const SECRET = 'whsec_tombstone_inert_fixture_no_real_secret'
let database: PGlite
beforeAll(async () => {
  database = await createPrimeDatabase()
  await resetPrimeDatabase(database)
  fixture.bridge = primeSqlBridge(database)
  fixture.stripe = new Stripe('sk_test_tombstone_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_tombstone_inert_fixture_no_real_key')
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
    data: { object: { id: 'cs_synthetic_deleted_owner', object: 'checkout.session',
      customer: 'cus_synthetic_prime', subscription: 'sub_synthetic_prime', metadata: { user_id: userId } } } })
  const signature = fixture.stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  return POST(new NextRequest('http://fixture.invalid/webhook',
    { method: 'POST', headers: { 'stripe-signature': signature }, body: payload }))
}

it('keeps the credited Session consumed after account deletion and refuses another beneficiary', async () => {
  expect((await deliver('evt_prime_before_account_deletion', USER_ONE)).status).toBe(200)
  await database.exec('RESET ROLE')
  // The real account-deletion job deletes auth.users; versioned foreign keys
  // cascade to the profile, wallet and descriptive wallet transactions.
  await database.query('DELETE FROM auth.users WHERE id=$1', [USER_ONE])
  await database.exec('SET ROLE service_role')
  const replay = await deliver('evt_prime_after_account_deletion', USER_TWO)
  expect(replay.status).toBe(503)
  expect((await database.query('SELECT * FROM akasha_ai.wallet_transactions')).rows).toHaveLength(0)
  expect((await database.query('SELECT * FROM akasha_ai.wallets')).rows).toHaveLength(0)
  await database.exec('RESET ROLE')
  expect((await database.query(`SELECT user_id, checkout_session_id
    FROM akasha_ai.checkout_prime_j1_receipts`)).rows).toEqual([
    { user_id: null, checkout_session_id: 'cs_synthetic_deleted_owner' },
  ])
  expect((await database.query('SELECT id FROM auth.users WHERE id=$1', [USER_ONE])).rows).toHaveLength(0)
  expect(fixture.bridge.state.errors).toContain('Conflicting Checkout prime evidence')
})
