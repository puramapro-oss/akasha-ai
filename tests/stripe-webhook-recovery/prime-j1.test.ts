import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { POST as publicPost } from '../../src/app/api/stripe/webhook/route'
import { POST as internalPost } from '../../src/app/api/internal/stripe-fulfillment/route'

const SECRET = 'whsec_prime_inert_fixture_no_real_secret'
const INTERNAL = 'prime_inert_internal_no_real_secret'
let database: PGlite
let releaseBarrier: (() => void) | null = null

beforeAll(async () => { database = await createPrimeDatabase() }, 15000)
beforeEach(async () => {
  await resetPrimeDatabase(database)
  fixture.bridge = primeSqlBridge(database)
  fixture.stripe = new Stripe('sk_test_prime_inert_fixture_no_real_key')
  fixture.networkAttempts = 0
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_prime_inert_fixture_no_real_key')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('INTERNAL_WEBHOOK_SECRET', INTERNAL)
  vi.stubGlobal('fetch', () => { fixture.networkAttempts++; throw new Error('Network forbidden') })
})
afterEach(() => {
  releaseBarrier?.(); releaseBarrier = null
  expect(fixture.networkAttempts).toBe(0)
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
afterAll(async () => { await database?.close() })

function checkout(eventId: string, session = 'cs_synthetic_prime', userId = USER_ONE) {
  return { id: eventId, object: 'event', type: 'checkout.session.completed',
    created: 1794390000, livemode: false, api_version: '2026-03-25.dahlia',
    data: { object: { id: session, object: 'checkout.session', customer: 'cus_synthetic_prime',
      subscription: 'sub_synthetic_prime', metadata: { user_id: userId } } } }
}

async function deliver(event: ReturnType<typeof checkout>, internal = false) {
  const payload = JSON.stringify(event)
  const signature = fixture.stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  const headers: Record<string, string> = { [internal ? 'x-stripe-signature' : 'stripe-signature']: signature }
  if (internal) headers['x-internal-secret'] = INTERNAL
  return (internal ? internalPost : publicPost)(new NextRequest('http://fixture.invalid/webhook',
    { method: 'POST', headers, body: payload }))
}

function interleaveLegacyInserts() {
  let arrivals = 0
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  releaseBarrier = release
  fixture.bridge.state.legacyInsertBarrier = async () => {
    if (++arrivals === 2) release()
    await waiting
  }
}

async function creditTotals() {
  return (await database.query<{ transactions: number; balance: string; earned: string }>(`
    SELECT (SELECT count(*)::integer FROM akasha_ai.wallet_transactions WHERE type = 'prime_j1') AS transactions,
      coalesce(sum(balance), 0)::text AS balance, coalesce(sum(total_earned), 0)::text AS earned
    FROM akasha_ai.wallets`)).rows[0]
}

describe('prime J+1 economic identity with real source and in-process SQL', () => {
  it('credits one prime when two signed Event IDs describe the same Checkout Session concurrently', async () => {
    interleaveLegacyInserts()
    const outcomes = await Promise.all([
      deliver(checkout('evt_prime_duplicate_a')),
      deliver(checkout('evt_prime_duplicate_b'), true),
    ])
    expect(outcomes.map(result => result.status)).toEqual([200, 200])
    expect(await creditTotals()).toEqual({ transactions: 1, balance: '25.00', earned: '25.00' })
  })

  it('keeps both valid credits when distinct Checkout Sessions share one wallet concurrently', async () => {
    interleaveLegacyInserts()
    const outcomes = await Promise.all([
      deliver(checkout('evt_prime_session_a', 'cs_synthetic_prime_a')),
      deliver(checkout('evt_prime_session_b', 'cs_synthetic_prime_b'), true),
    ])
    expect(outcomes.map(result => result.status)).toEqual([200, 200])
    expect(await creditTotals()).toEqual({ transactions: 2, balance: '50.00', earned: '50.00' })
  })

  it('refuses a second beneficiary for an already credited Checkout Session', async () => {
    expect((await deliver(checkout('evt_prime_owner_a'))).status).toBe(200)
    const conflict = await deliver(checkout('evt_prime_owner_b', 'cs_synthetic_prime', USER_TWO), true)
    expect(conflict.status).toBe(503)
    expect(await creditTotals()).toEqual({ transactions: 1, balance: '25.00', earned: '25.00' })
  })

  it('retains the already qualified same-Event completed-duplicate control', async () => {
    const event = checkout('evt_prime_same_event')
    expect((await deliver(event)).status).toBe(200)
    const duplicate = await deliver(event, true)
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toEqual({ received: true, duplicate: true })
    expect(await creditTotals()).toEqual({ transactions: 1, balance: '25.00', earned: '25.00' })
  })
})
