import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

type JsonRecord = Record<string, unknown>
type Row = {
  identity: JsonRecord
  event: JsonRecord
  state: 'processing' | 'completed' | 'reconciliation_required'
  attempt_token: string | null
  legacy: boolean
}
type Barrier = { entered: Promise<void>; wait: Promise<void>; signal: () => void; release: () => void }

const fixture = vi.hoisted(() => {
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const key = (value: JsonRecord) => JSON.stringify([value.stripe_account_key, value.livemode, value.event_id])
  const identity = (value: JsonRecord) => ({
    stripe_account_key: value.stripe_account_key,
    livemode: value.livemode,
    event_id: value.event_id,
    fingerprint: value.fingerprint,
  })
  const state = {
    stripe: null as unknown as Stripe,
    claimError: null as null | string,
    loseAdmissionAcknowledgement: false,
    admissionPatch: null as null | ((receipt: JsonRecord) => unknown),
    completionMode: 'ok' as 'ok' | 'error-before' | 'error-after' | 'throw-after',
    completionPatch: null as null | ((receipt: JsonRecord) => unknown),
    reconciliationError: false,
    profileError: null as null | string,
    profileLookupError: false,
    loseCheckoutAcknowledgement: false,
    profileBarrier: null as Barrier | null,
    walletError: null as null | 'upsert' | 'lookup' | 'insert' | 'update',
    invoiceNumberError: false,
    paymentError: false,
    karmaMode: 'unexpected' as 'unexpected' | 'ok' | 'not-ok' | 'throw' | 'real-legacy' | 'real-success',
    legacyOrigins: new Set<string>(),
    claims: new Map<string, Row>(),
    primeReceipts: new Map<string, JsonRecord>(),
    claimAttempts: [] as JsonRecord[],
    completionAttempts: [] as JsonRecord[],
    reconciliationAttempts: [] as JsonRecord[],
    profileAttempts: [] as JsonRecord[],
    profileLookups: [] as JsonRecord[],
    invoiceNumberAttempts: [] as JsonRecord[],
    profileWrites: [] as JsonRecord[],
    walletAttempts: [] as JsonRecord[],
    walletTransactions: [] as JsonRecord[],
    walletUpdates: [] as JsonRecord[],
    paymentAttempts: [] as JsonRecord[],
    paymentWrites: [] as JsonRecord[],
    karmaAttempts: [] as unknown[],
    karmaRpcAttempts: [] as JsonRecord[],
    karmaSkipLogs: [] as JsonRecord[],
    responses: [] as Array<{ ingress: string; status: number; body: unknown }>,
    diagnostics: [] as unknown[],
    timeline: [] as string[],
    serviceClientCalls: 0,
    stripeClientCalls: 0,
    networkAttempts: 0,
  }
  const admissionReceipt = (row: Row, admitted: boolean) => ({
    admitted, state: row.state, ...row.identity,
    attempt_token: admitted ? row.attempt_token : null, legacy: row.legacy,
  })
  const db = {
    // This is an inert database PORT, not a substitute implementation of the handler.
    // Real SQL tests separately qualify atomicity, grants and legacy lookups.
    async rpc(name: string, args: JsonRecord = {}) {
      if (name === 'complete_checkout_prime_j1') {
        // Model one commit boundary, not durable intermediate profile writes.
        // SQL rollback/locking proof comes from prime-*.test.ts, not these arrays.
        const identity = JSON.stringify([args.p_stripe_account_key, args.p_livemode, args.p_checkout_session_id])
        const framed = [args.p_customer_id, args.p_subscription_id, args.p_plan, args.p_plan_tier]
          .map(value => value === null ? 'n;' : Buffer.byteLength(String(value), 'utf8') + ':' + value + ';').join('')
        const intentHash = createHash('sha256').update('akasha-checkout-profile-v1;' + framed, 'utf8').digest('hex')
        const previous = state.primeReceipts.get(identity)
        if (previous) {
          if (previous.user_id !== args.p_user_id || previous.amount !== args.p_amount
            || previous.currency !== args.p_currency || previous.promo_source !== args.p_promo_source
            || previous.profile_intent_sha256 !== intentHash) return { data: null, error: { code: '22023' } }
          return { data: { ...previous, status: 'already_credited' }, error: null }
        }
        const profileData: JsonRecord = { stripe_customer_id: args.p_customer_id,
          stripe_subscription_id: args.p_subscription_id, subscription_started_at: new Date().toISOString() }
        if (args.p_plan !== null) { profileData.plan = args.p_plan; profileData.plan_tier = args.p_plan_tier }
        const profileAttempt = { column: 'id', value: args.p_user_id, data: profileData }
        state.profileAttempts.push(profileAttempt)
        state.timeline.push('profile-attempt')
        const barrier = state.profileBarrier
        if (barrier) { barrier.signal(); await barrier.wait }
        if (state.profileError) return { data: null, error: { code: state.profileError } }
        for (const operation of ['upsert', 'lookup', 'insert', 'update']) {
          state.walletAttempts.push({ operation })
          if (state.walletError === operation) return { data: null, error: { code: '08006' } }
        }
        const receipt = {
          version: 1, status: 'credited', stripe_account_key: args.p_stripe_account_key,
          livemode: args.p_livemode, checkout_session_id: args.p_checkout_session_id,
          user_id: args.p_user_id, promo_source: args.p_promo_source,
          amount: args.p_amount, currency: args.p_currency,
          wallet_id: 'wallet-inert', transaction_id: 'transaction-inert',
          balance_after: args.p_amount, total_earned_after: args.p_amount,
          profile_intent_version: 1, profile_intent_sha256: intentHash,
        }
        state.profileWrites.push(profileAttempt)
        state.walletTransactions.push({ wallet_id: receipt.wallet_id, amount: args.p_amount, type: 'prime_j1' })
        state.walletUpdates.push({ column: 'id', value: receipt.wallet_id,
          data: { balance: receipt.balance_after, total_earned: receipt.total_earned_after } })
        state.timeline.push('profile-confirmed', 'transaction-confirmed', 'wallet-confirmed')
        state.primeReceipts.set(identity, receipt)
        if (state.loseCheckoutAcknowledgement) {
          state.loseCheckoutAcknowledgement = false
          throw new Error('Synthetic response lost after profile+prime SQL commit')
        }
        return { data: receipt, error: null }
      }
      if (name === 'admit_stripe_webhook_event') {
        state.claimAttempts.push(copy(args))
        state.timeline.push('admit')
        if (state.claimError) return { data: null, error: { code: state.claimError } }
        const event = args.p_event as JsonRecord
        const token = args.p_attempt_token as string
        const journalKey = key(event)
        let row = state.claims.get(journalKey)
        let admitted = false
        if (row) {
          if (row.identity.fingerprint !== event.fingerprint) {
            return { data: null, error: { code: '22023', message: 'Synthetic identity conflict' } }
          }
        } else {
          const legacy = state.legacyOrigins.size > 0
          row = { identity: identity(event), event: copy(event), state: legacy ? 'reconciliation_required' : 'processing',
            attempt_token: legacy ? null : token, legacy }
          state.claims.set(journalKey, row)
          admitted = !legacy
        }
        if (state.loseAdmissionAcknowledgement) {
          state.loseAdmissionAcknowledgement = false
          return { data: null, error: { code: '08006', message: 'Synthetic admission acknowledgement lost' } }
        }
        const receipt = admissionReceipt(row, admitted)
        return { data: state.admissionPatch ? state.admissionPatch(receipt) : receipt, error: null }
      }
      if (name === 'complete_stripe_webhook_event') {
        state.completionAttempts.push(copy(args))
        state.timeline.push('complete')
        const supplied = args.p_identity as JsonRecord
        const row = state.claims.get(key(supplied))
        if (!row || row.attempt_token !== args.p_attempt_token ||
          row.identity.fingerprint !== supplied.fingerprint || row.state !== 'processing') {
          return { data: null, error: { code: '42501', message: 'Synthetic ownership rejection' } }
        }
        if (state.completionMode === 'error-before') return { data: null, error: { code: '08006' } }
        row.state = 'completed'
        if (state.completionMode === 'error-after') return { data: null, error: { code: '08006' } }
        if (state.completionMode === 'throw-after') throw new Error('Synthetic completion acknowledgement lost')
        const receipt = { completed: true, ...row.identity, attempt_token: row.attempt_token }
        return { data: state.completionPatch ? state.completionPatch(receipt) : receipt, error: null }
      }
      if (name === 'reconcile_stripe_webhook_event') {
        state.reconciliationAttempts.push(copy(args))
        state.timeline.push('reconcile')
        if (state.reconciliationError) return { data: null, error: { code: '08006' } }
        const supplied = args.p_identity as JsonRecord
        const row = state.claims.get(key(supplied))
        if (!row || row.attempt_token !== args.p_attempt_token || row.identity.fingerprint !== supplied.fingerprint) {
          return { data: null, error: { code: '42501' } }
        }
        if (row.state !== 'completed') row.state = 'reconciliation_required'
        return { data: { recorded: true, state: row.state, ...row.identity, attempt_token: row.attempt_token }, error: null }
      }
      if (name === 'karma_split_apply_akasha') {
        state.karmaRpcAttempts.push(copy(args))
        const legacy = state.karmaMode === 'real-legacy'
        return { data: { log_id: 'synthetic-existing-financial-log', already_processed: legacy,
          pool_tx_ids: legacy ? [] : ['synthetic-reward', 'synthetic-adya', 'synthetic-asso', 'synthetic-sasu'] }, error: null }
      }
      if (name === 'next_invoice_number') {
        state.invoiceNumberAttempts.push(copy(args))
        return state.invoiceNumberError
          ? { data: null, error: { code: '08006' } }
          : { data: 'SYNTHETIC-INVOICE-1', error: null }
      }
      throw new Error('Unexpected database RPC boundary: ' + name)
    },
    from(table: string) {
      if (table === 'profiles') return {
        update(data: JsonRecord) {
          return { eq(column: string, value: string) { return { select() { return { async single() {
            state.profileAttempts.push({ column, value, data: copy(data) })
            state.timeline.push('profile-attempt')
            const barrier = state.profileBarrier
            if (barrier) { barrier.signal(); await barrier.wait }
            if (state.profileError) return { data: null, error: { code: state.profileError } }
            state.profileWrites.push({ column, value, data: copy(data) })
            state.timeline.push('profile-confirmed')
            return { data: { id: column === 'id' ? value : '00000000-0000-4000-8000-000000000001',
              stripe_customer_id: column === 'stripe_customer_id' ? value : data.stripe_customer_id }, error: null }
          } } } } } }
        },
        select() { return { eq(column: string, value: string) { return { async single() {
          state.profileLookups.push({ column, value })
          return state.profileLookupError
            ? { data: null, error: { code: '08006' } }
            : { data: { id: '00000000-0000-4000-8000-000000000001' }, error: null }
        } } } } },
      }
      if (table === 'wallets') return {
        upsert() {
          state.walletAttempts.push({ operation: 'upsert' })
          return { select() { return { async single() {
            return state.walletError === 'upsert'
              ? { data: null, error: { code: '08006' } }
              : { data: { id: 'wallet-inert', balance: 0, total_earned: 0 }, error: null }
          } } } }
        },
        update(data: JsonRecord) { return { eq(column: string, value: string) { return { select() { return { async single() {
          state.walletAttempts.push({ operation: 'update', column, value, data: copy(data) })
          if (state.walletError === 'update') return { data: null, error: { code: '08006' } }
          state.walletUpdates.push({ column, value, data: copy(data) })
          state.timeline.push('wallet-confirmed')
          return { data: { id: value, ...data }, error: null }
        } } } } } } },
      }
      if (table === 'wallet_transactions') {
        const query = {
          eq() { return query }, ilike() { return query }, limit() { return query },
          async maybeSingle() {
            state.walletAttempts.push({ operation: 'lookup' })
            return state.walletError === 'lookup'
              ? { data: null, error: { code: '08006' } }
              : { data: state.walletTransactions.length ? { id: 'transaction-inert' } : null, error: null }
          },
        }
        return {
          select() { return query },
          insert(row: JsonRecord) { return { select() { return { async single() {
            state.walletAttempts.push({ operation: 'insert', row: copy(row) })
            if (state.walletError === 'insert') return { data: null, error: { code: '08006' } }
            state.walletTransactions.push(copy(row))
            state.timeline.push('transaction-confirmed')
            return { data: { id: 'transaction-inert' }, error: null }
          } } } } },
        }
      }
      if (table === 'karma_split_log') return { insert(row: JsonRecord) { return { select() { return { async single() {
        state.karmaSkipLogs.push(copy(row))
        return { data: { id: 'synthetic-zero-invoice-log' }, error: null }
      } } } } } }
      if (table === 'payments') return { insert(row: JsonRecord) { return { select() { return { async single() {
        state.paymentAttempts.push(copy(row))
        if (state.paymentError) return { data: null, error: { code: '08006' } }
        state.paymentWrites.push(copy(row))
        return { data: { id: 'payment-inert' }, error: null }
      } } } } } }
      throw new Error('Unexpected database boundary: ' + table)
    },
  }
  return { state, db }
})

vi.mock('@/lib/stripe', () => ({
  getStripe: () => { fixture.state.stripeClientCalls++; return fixture.state.stripe },
}))
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => { fixture.state.serviceClientCalls++; return fixture.db },
}))
vi.mock('@/lib/supabase-public', () => ({
  createPublicServiceClient: () => { throw new Error('Unexpected public database boundary') },
}))
vi.mock('@/lib/stripe/connect', () => ({
  syncConnectAccount: () => { throw new Error('Unexpected Connect boundary') },
}))
vi.mock('@/lib/karma/dispatch', () => ({
  dispatchKarmaSplit: async (invoice: unknown) => {
    const s = fixture.state
    s.karmaAttempts.push(invoice)
    if (s.karmaMode === 'real-legacy' || s.karmaMode === 'real-success') {
      const real = await vi.importActual<typeof import('@/lib/karma/dispatch')>('@/lib/karma/dispatch')
      return real.dispatchKarmaSplit(invoice as Stripe.Invoice,
        fixture.db as unknown as Parameters<typeof real.dispatchKarmaSplit>[1])
    }
    if (s.karmaMode === 'unexpected' || s.karmaMode === 'throw') throw new Error('Synthetic Karma dispatch failure')
    return s.karmaMode === 'ok'
      ? { ok: true, status: 'ok', logId: 'synthetic-karma-log' }
      : { ok: false, status: 'failed', error: 'Synthetic Karma rejection' }
  },
}))

// Both route adapters, the shared handler, journal client and effect helpers are
// genuine application imports. Only their external boundaries above are inert.
import { POST as publicPost } from '../../src/app/api/stripe/webhook/route'
import { POST as internalPost } from '../../src/app/api/internal/stripe-fulfillment/route'

const TEST_API_KEY = 'sk_test_synthetic_fixture_not_a_real_key'
const SECRET = 'whsec_synthetic_fixture_not_a_real_secret'
const INTERNAL_SECRET = 'synthetic_internal_fixture_not_a_real_secret'
const EVENT_ID = 'evt_synthetic_checkout_recovery'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const EVENT_CREATED = 1794390000
const observations: unknown[] = []

beforeEach(() => {
  const s = fixture.state
  s.stripe = new Stripe(TEST_API_KEY)
  s.claimError = null
  s.loseAdmissionAcknowledgement = false
  s.admissionPatch = null
  s.completionMode = 'ok'
  s.completionPatch = null
  s.reconciliationError = false
  s.profileError = null
  s.profileLookupError = false
  s.loseCheckoutAcknowledgement = false
  s.profileBarrier = null
  s.walletError = null
  s.invoiceNumberError = false
  s.paymentError = false
  s.karmaMode = 'unexpected'
  // Test isolation only: claims are NEVER deleted between deliveries of a case.
  s.claims.clear()
  s.primeReceipts.clear()
  s.legacyOrigins.clear()
  for (const list of [s.claimAttempts, s.completionAttempts, s.reconciliationAttempts,
    s.profileAttempts, s.profileLookups, s.invoiceNumberAttempts, s.profileWrites, s.walletAttempts, s.walletTransactions, s.walletUpdates,
    s.paymentAttempts, s.paymentWrites, s.karmaAttempts, s.karmaRpcAttempts, s.karmaSkipLogs, s.responses, s.diagnostics, s.timeline]) list.length = 0
  s.networkAttempts = 0
  s.serviceClientCalls = 0
  s.stripeClientCalls = 0
  vi.stubEnv('STRIPE_SECRET_KEY', TEST_API_KEY)
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('INTERNAL_WEBHOOK_SECRET', INTERNAL_SECRET)
  vi.stubGlobal('fetch', () => { s.networkAttempts++; throw new Error('Network forbidden by fixture') })
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    s.diagnostics.push(args.map(arg => arg instanceof Error ? arg.message : arg))
  })
})

afterEach(() => {
  const s = fixture.state
  s.profileBarrier?.release()
  observations.push(JSON.parse(JSON.stringify({
    test: expect.getState().currentTestName,
    claimError: s.claimError, profileError: s.profileError, walletError: s.walletError,
    completionMode: s.completionMode, legacyOrigins: [...s.legacyOrigins],
    claims: [...s.claims.values()], claimAttempts: s.claimAttempts,
    completionAttempts: s.completionAttempts, reconciliationAttempts: s.reconciliationAttempts,
    profileAttempts: s.profileAttempts, profileLookups: s.profileLookups,
    invoiceNumberAttempts: s.invoiceNumberAttempts, profileWrites: s.profileWrites,
    walletAttempts: s.walletAttempts, walletTransactions: s.walletTransactions, walletUpdates: s.walletUpdates,
    paymentAttempts: s.paymentAttempts, paymentWrites: s.paymentWrites, karmaAttempts: s.karmaAttempts, karmaRpcAttempts: s.karmaRpcAttempts, karmaSkipLogs: s.karmaSkipLogs,
    responses: s.responses, diagnostics: s.diagnostics, timeline: s.timeline,
    serviceClientCalls: s.serviceClientCalls, networkAttempts: s.networkAttempts,
  })))
  expect(s.networkAttempts).toBe(0)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  const path = process.env.AKASHA_WEBHOOK_OBSERVATIONS
  if (path) writeFileSync(path, JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' })
})

function checkoutEvent(): JsonRecord {
  return {
    id: EVENT_ID, object: 'event', type: 'checkout.session.completed',
    created: EVENT_CREATED, livemode: false, api_version: '2026-03-25.dahlia',
    data: { object: {
      id: 'cs_synthetic_checkout', object: 'checkout.session',
      customer: 'cus_synthetic', subscription: 'sub_synthetic',
      metadata: { user_id: USER_ID },
    } },
  }
}

function invoiceEvent(type = 'invoice.paid'): JsonRecord {
  return { ...checkoutEvent(), id: 'evt_synthetic_invoice_recovery', type, data: { object: {
    id: 'in_synthetic', object: 'invoice', customer: 'cus_synthetic',
    amount_paid: 1000, currency: 'eur', created: EVENT_CREATED,
  } } }
}

type Delivery = {
  ingress?: 'public' | 'internal'
  event?: JsonRecord
  validSignature?: boolean
  internalSecret?: string | null
  omitSignature?: boolean
}

async function deliver(options: Delivery | boolean = {}) {
  const opts: Delivery = typeof options === 'boolean' ? { validSignature: options } : options
  const ingress = opts.ingress ?? 'public'
  const payload = JSON.stringify(opts.event ?? checkoutEvent())
  const signature = fixture.state.stripe.webhooks.generateTestHeaderString({
    payload, secret: opts.validSignature === false ? 'whsec_other_synthetic_fixture' : SECRET,
  })
  const headers: Record<string, string> = {}
  if (!opts.omitSignature) headers[ingress === 'public' ? 'stripe-signature' : 'x-stripe-signature'] = signature
  if (ingress === 'internal' && opts.internalSecret !== null) {
    headers['x-internal-secret'] = opts.internalSecret ?? INTERNAL_SECRET
  }
  const request = new NextRequest('http://fixture.invalid/api/' +
    (ingress === 'public' ? 'stripe/webhook' : 'internal/stripe-fulfillment'), {
    method: 'POST', headers, body: payload,
  })
  const response = await (ingress === 'public' ? publicPost(request) : internalPost(request))
  const body = await response.json()
  fixture.state.responses.push({ ingress, status: response.status, body })
  return { response, body }
}

function assertRetryable(status: number) { expect(status).toBeGreaterThanOrEqual(500); expect(status).toBeLessThan(600) }
function assertNoEffects() {
  const s = fixture.state
  expect(s.profileAttempts).toHaveLength(0)
  expect(s.walletAttempts).toHaveLength(0)
  expect(s.paymentAttempts).toHaveLength(0)
  expect(s.karmaAttempts).toHaveLength(0)
}
function assertNoCompletion() {
  expect(fixture.state.completionAttempts).toHaveLength(0)
  expect([...fixture.state.claims.values()].every(row => row.state !== 'completed')).toBe(true)
}
function counts() {
  const s = fixture.state
  return [s.profileAttempts.length, s.walletAttempts.length, s.paymentAttempts.length, s.karmaAttempts.length]
}
function makeBarrier(): Barrier {
  let signal!: () => void
  let release!: () => void
  const entered = new Promise<void>(resolve => { signal = resolve })
  const wait = new Promise<void>(resolve => { release = resolve })
  return { entered, wait, signal, release }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical((value as JsonRecord)[key])).join(',') + '}'
  return JSON.stringify(value)
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).reverse()
    .map(key => [key, reverseKeys((value as JsonRecord)[key])]))
  return value
}

describe('real Stripe handler and claim recovery boundaries', () => {
  it('rejects an invalid signature before claiming or applying any effect', async () => {
    const { response } = await deliver(false)
    expect(response.status).toBe(400)
    expect(fixture.state.serviceClientCalls).toBe(0)
    expect(fixture.state.claimAttempts).toHaveLength(0)
    assertNoEffects()
  })

  it('acknowledges a completed checkout and suppresses only its completed duplicate', async () => {
    const first = await deliver()
    const repeated = await deliver()
    expect(first.response.status).toBe(200)
    expect(repeated.response.status).toBe(200)
    expect(repeated.body).toEqual({ received: true, duplicate: true })
    expect(fixture.state.claims.size).toBe(1)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
    expect([...fixture.state.claims.values()][0].state).toBe('completed')
    expect(fixture.state.timeline.indexOf('complete')).toBeGreaterThan(fixture.state.timeline.indexOf('wallet-confirmed'))
  })

  it('does not acknowledge completion on retry after an atomic checkout commit and lost response', async () => {
    fixture.state.loseCheckoutAcknowledgement = true
    const first = await deliver()
    assertRetryable(first.response.status)
    expect(fixture.state.claims.size).toBe(1)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.primeReceipts.size).toBe(1)
    const repeated = await deliver()
    // No claim deletion or replay is demanded after an already-applied write.
    expect(fixture.state.claims.size).toBe(1)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.primeReceipts.size).toBe(1)
    assertRetryable(repeated.response.status)
    assertNoCompletion()
  })

  for (const code of ['42P01', '08006']) {
    it('stops before effects when the real claim helper receives database error ' + code, async () => {
      fixture.state.claimError = code
      const { response } = await deliver()
      expect(fixture.state.claims.size).toBe(0)
      expect(fixture.state.claimAttempts).toHaveLength(1)
      assertRetryable(response.status)
      assertNoEffects()
      assertNoCompletion()
    })
  }

  it('does not acknowledge or credit a checkout when the atomic RPC reports a profile error', async () => {
    fixture.state.profileError = '08006'
    const { response } = await deliver()
    expect(fixture.state.claims.size).toBe(1)
    expect(fixture.state.profileWrites).toHaveLength(0)
    expect(fixture.state.profileAttempts).toHaveLength(1)
    assertRetryable(response.status)
    expect(fixture.state.walletTransactions).toHaveLength(0)
    assertNoCompletion()
  })
})

describe('two authenticated ingress adapters share one journal', () => {
  for (const firstIngress of ['public', 'internal'] as const) {
    it(firstIngress + ' then the other ingress executes one confirmed set of effects', async () => {
      const first = await deliver({ ingress: firstIngress })
      const second = await deliver({ ingress: firstIngress === 'public' ? 'internal' : 'public' })
      expect(first.response.status).toBe(200)
      expect(second.response.status).toBe(200)
      expect(second.body).toEqual({ received: true, duplicate: true })
      expect(fixture.state.claims.size).toBe(1)
      expect(fixture.state.profileWrites).toHaveLength(1)
      expect(fixture.state.walletTransactions).toHaveLength(1)
      expect(fixture.state.walletUpdates).toHaveLength(1)
      expect(fixture.state.completionAttempts).toHaveLength(1)
    })
  }

  for (const internalSecret of [null, 'synthetic_wrong_secret']) {
    it('rejects internal authentication ' + (internalSecret === null ? 'absence' : 'mismatch') + ' before Stripe or database access', async () => {
      const { response } = await deliver({ ingress: 'internal', internalSecret })
      expect(response.status).toBe(401)
      expect(fixture.state.stripeClientCalls).toBe(0)
      expect(fixture.state.serviceClientCalls).toBe(0)
      assertNoEffects()
    })
  }

  for (const configuredSecret of ['', undefined]) {
    it('rejects an ' + (configuredSecret === '' ? 'empty' : 'absent') + ' configured internal secret before admission', async () => {
      vi.stubEnv('INTERNAL_WEBHOOK_SECRET', configuredSecret)
      const { response } = await deliver({ ingress: 'internal', internalSecret: configuredSecret === '' ? '' : null })
      expect(response.status).toBe(401)
      expect(fixture.state.stripeClientCalls).toBe(0)
      expect(fixture.state.serviceClientCalls).toBe(0)
      assertNoEffects()
    })
  }

  it('verifies the internal Stripe signature after internal authentication and before the database', async () => {
    const { response } = await deliver({ ingress: 'internal', validSignature: false })
    expect(response.status).toBe(400)
    expect(fixture.state.serviceClientCalls).toBe(0)
    assertNoEffects()
  })

  it('requires a public Stripe signature before any database access', async () => {
    const { response } = await deliver({ omitSignature: true })
    expect(response.status).toBe(400)
    expect(fixture.state.serviceClientCalls).toBe(0)
    assertNoEffects()
  })

  it('refuses concurrent processing without admitting a second ingress', async () => {
    const barrier = makeBarrier()
    fixture.state.profileBarrier = barrier
    const first = deliver()
    let firstResult: Awaited<typeof first> | undefined
    try {
      await Promise.race([barrier.entered, first.then(() => {
        throw new Error('First ingress returned before reaching the held effect')
      })])
      expect([...fixture.state.claims.values()][0].state).toBe('processing')
      expect(fixture.state.completionAttempts).toHaveLength(0)
      const second = await deliver({ ingress: 'internal' })
      expect(second.response.status).toBe(503)
      expect(fixture.state.profileAttempts).toHaveLength(1)
      expect(fixture.state.walletAttempts).toHaveLength(0)
    } finally {
      barrier.release()
      firstResult = await first
    }
    expect(firstResult.response.status).toBe(200)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })
})

describe('admission identity and durable ownership', () => {
  const changes: Array<[string, (receipt: JsonRecord) => unknown]> = [
    ['account', receipt => ({ ...receipt, stripe_account_key: 'acct_other_synthetic' })],
    ['mode', receipt => ({ ...receipt, livemode: !receipt.livemode })],
    ['event', receipt => ({ ...receipt, event_id: 'evt_other_synthetic' })],
    ['payload fingerprint', receipt => ({ ...receipt, fingerprint: '0'.repeat(64) })],
    ['attempt owner', receipt => ({ ...receipt, attempt_token: '00000000-0000-4000-8000-000000000099' })],
    ['contradictory completion', receipt => ({ ...receipt, state: 'completed' })],
    ['legacy admission', receipt => ({ ...receipt, legacy: true })],
    ['missing receipt', () => null],
  ]
  for (const [label, change] of changes) {
    it('refuses an invalid admission receipt before effects: ' + label, async () => {
      fixture.state.admissionPatch = change
      const { response } = await deliver()
      assertRetryable(response.status)
      assertNoEffects()
      assertNoCompletion()
    })
  }

  it('does not reinterpret a changed payload for the same event identity as a completed duplicate', async () => {
    expect((await deliver()).response.status).toBe(200)
    const event = checkoutEvent()
    event.data = { object: { id: 'cs_other_synthetic', metadata: { user_id: USER_ID } } }
    const { response } = await deliver({ ingress: 'internal', event })
    assertRetryable(response.status)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  it('requires matching identity on a completed duplicate receipt too', async () => {
    expect((await deliver()).response.status).toBe(200)
    fixture.state.admissionPatch = receipt => ({ ...receipt, livemode: true })
    const { response } = await deliver()
    assertRetryable(response.status)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  it('uses a canonical stable payload while excluding Stripe delivery envelope fields', async () => {
    const event = checkoutEvent()
    event.account = 'acct_synthetic'
    event.request = { id: 'req_first', idempotency_key: null }
    event.pending_webhooks = 2
    expect((await deliver({ event })).response.status).toBe(200)
    const retry = reverseKeys({ ...event, request: { id: 'req_second', idempotency_key: 'delivery_only' }, pending_webhooks: 1 }) as JsonRecord
    expect((await deliver({ ingress: 'internal', event: retry })).response.status).toBe(200)
    const first = fixture.state.claimAttempts[0].p_event as JsonRecord
    const second = fixture.state.claimAttempts[1].p_event as JsonRecord
    const expected = {
      version: 1, stripe_account_key: 'acct_synthetic', livemode: false,
      event_id: EVENT_ID, event_type: event.type, event_created: EVENT_CREATED,
      api_version: event.api_version, event_data: event.data,
    }
    expect(first).toEqual({ ...expected, fingerprint: createHash('sha256').update(canonical(expected)).digest('hex') })
    expect(second).toEqual(first)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  it('keeps a persisted admission with a lost response ambiguous without starting effects on retry', async () => {
    fixture.state.loseAdmissionAcknowledgement = true
    assertRetryable((await deliver()).response.status)
    expect(fixture.state.claims.size).toBe(1)
    assertRetryable((await deliver({ ingress: 'internal' })).response.status)
    expect([...fixture.state.claims.values()][0].state).toBe('processing')
    assertNoEffects()
    assertNoCompletion()
  })

  for (const origin of ['stripe_events_processed', 'stripe_events']) {
    it('treats a legacy receipt from ' + origin + ' as unresolved rather than completed', async () => {
      fixture.state.legacyOrigins.add(origin)
      const first = await deliver()
      const second = await deliver({ ingress: 'internal' })
      expect(first.response.status).toBe(503)
      expect(second.response.status).toBe(503)
      expect([...fixture.state.claims.values()][0].legacy).toBe(true)
      assertNoEffects()
      assertNoCompletion()
    })
  }
})

describe('confirmation requires every required effect and its durable receipt', () => {
  it('does not complete a new invoice event from an ambiguous historical financial receipt', async () => {
    fixture.state.karmaMode = 'real-legacy'
    const first = await deliver({ event: invoiceEvent() })
    // This calls the genuine dispatcher and calculation; only its RPC port is inert.
    expect(fixture.state.karmaRpcAttempts).toHaveLength(1)
    expect(fixture.state.karmaRpcAttempts[0].p_stripe_invoice_id).toBe('in_synthetic')
    assertRetryable(first.response.status)
    assertNoCompletion()
    assertRetryable((await deliver({ ingress: 'internal', event: invoiceEvent() })).response.status)
    expect(fixture.state.karmaRpcAttempts).toHaveLength(1)
  })

  for (const operation of ['upsert', 'lookup', 'insert', 'update'] as const) {
    it('retains reconciliation after wallet ' + operation + ' returns a Supabase error', async () => {
      fixture.state.walletError = operation
      assertRetryable((await deliver()).response.status)
      const attempts = counts()
      expect(fixture.state.walletAttempts.at(-1)?.operation).toBe(operation)
      expect(fixture.state.profileWrites).toHaveLength(0)
      expect(fixture.state.walletTransactions).toHaveLength(0)
      expect(fixture.state.walletUpdates).toHaveLength(0)
      expect(fixture.state.primeReceipts.size).toBe(0)
      assertNoCompletion()
      assertRetryable((await deliver({ ingress: 'internal' })).response.status)
      expect(counts()).toEqual(attempts)
      expect([...fixture.state.claims.values()][0].state).toBe('reconciliation_required')
    })
  }

  it('does not report completion or repeat effects when completion persistence fails', async () => {
    fixture.state.completionMode = 'error-before'
    assertRetryable((await deliver()).response.status)
    expect(fixture.state.completionAttempts).toHaveLength(1)
    expect([...fixture.state.claims.values()][0].state).toBe('reconciliation_required')
    assertRetryable((await deliver()).response.status)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  for (const mode of ['error-after', 'throw-after'] as const) {
    it('acknowledges a lost completion response only on a later matching durable receipt: ' + mode, async () => {
      fixture.state.completionMode = mode
      assertRetryable((await deliver()).response.status)
      expect([...fixture.state.claims.values()][0].state).toBe('completed')
      const repeated = await deliver({ ingress: 'internal' })
      expect(repeated.response.status).toBe(200)
      expect(repeated.body).toEqual({ received: true, duplicate: true })
      expect(fixture.state.profileWrites).toHaveLength(1)
      expect(fixture.state.walletTransactions).toHaveLength(1)
      expect(fixture.state.walletUpdates).toHaveLength(1)
      expect(fixture.state.completionAttempts).toHaveLength(1)
    })
  }

  for (const field of ['fingerprint', 'attempt_token']) {
    it('does not acknowledge a malformed completion receipt: ' + field, async () => {
      fixture.state.completionPatch = receipt => ({ ...receipt, [field]: 'synthetic_mismatch' })
      assertRetryable((await deliver()).response.status)
      expect(fixture.state.profileWrites).toHaveLength(1)
      expect(fixture.state.completionAttempts).toHaveLength(1)
    })
  }

  it('keeps a reconciliation write failure closed without replaying an atomic checkout commit', async () => {
    fixture.state.loseCheckoutAcknowledgement = true
    fixture.state.reconciliationError = true
    assertRetryable((await deliver()).response.status)
    expect(fixture.state.reconciliationAttempts).toHaveLength(1)
    expect([...fixture.state.claims.values()][0].state).toBe('processing')
    assertRetryable((await deliver()).response.status)
    expect(fixture.state.profileWrites).toHaveLength(1)
    expect(fixture.state.walletTransactions).toHaveLength(1)
    expect(fixture.state.walletUpdates).toHaveLength(1)
    expect(fixture.state.primeReceipts.size).toBe(1)
    assertNoCompletion()
  })

  for (const mode of ['not-ok', 'throw'] as const) {
    it('leaves invoice processing unresolved when Karma dispatch is ' + mode, async () => {
      fixture.state.karmaMode = mode
      assertRetryable((await deliver({ event: invoiceEvent() })).response.status)
      assertRetryable((await deliver({ ingress: 'internal', event: invoiceEvent() })).response.status)
      expect(fixture.state.karmaAttempts).toHaveLength(1)
      assertNoCompletion()
    })
  }

  it('confirms an invoice only after the dispatcher explicitly reports success', async () => {
    fixture.state.karmaMode = 'ok'
    expect((await deliver({ event: invoiceEvent() })).response.status).toBe(200)
    expect((await deliver({ ingress: 'internal', event: invoiceEvent() })).response.status).toBe(200)
    expect(fixture.state.karmaAttempts).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  it('refuses a non-EUR paid invoice before any financial RPC or completion', async () => {
    fixture.state.karmaMode = 'real-success'
    const event = invoiceEvent()
    ;((event.data as JsonRecord).object as JsonRecord).currency = 'usd'
    const { response } = await deliver({ event })
    expect(fixture.state.karmaAttempts).toHaveLength(1)
    expect.soft(response.status, 'a USD amount must not be recorded as euros').toBeGreaterThanOrEqual(500)
    expect.soft(fixture.state.karmaRpcAttempts, 'currency must be checked before the financial RPC').toHaveLength(0)
    expect.soft(fixture.state.completionAttempts, 'contradictory currency is not a completed effect').toHaveLength(0)
  })

  it('confirms a new financial receipt from the real dispatcher without dispatching its completed duplicate again', async () => {
    fixture.state.karmaMode = 'real-success'
    expect((await deliver({ event: invoiceEvent() })).response.status).toBe(200)
    expect((await deliver({ ingress: 'internal', event: invoiceEvent() })).response.status).toBe(200)
    expect(fixture.state.karmaRpcAttempts).toHaveLength(1)
    expect(fixture.state.completionAttempts).toHaveLength(1)
    expect([...fixture.state.claims.values()][0].state).toBe('completed')
  })

  it('preserves the confirmed zero-EUR skip without a financial RPC or duplicate log', async () => {
    fixture.state.karmaMode = 'real-success'
    const event = invoiceEvent()
    ;((event.data as JsonRecord).object as JsonRecord).amount_paid = 0
    expect((await deliver({ event })).response.status).toBe(200)
    expect((await deliver({ ingress: 'internal', event })).response.status).toBe(200)
    expect(fixture.state.karmaRpcAttempts).toHaveLength(0)
    expect(fixture.state.karmaSkipLogs).toHaveLength(1)
    expect(fixture.state.karmaSkipLogs[0]).toMatchObject({
      stripe_invoice_id: 'in_synthetic', status: 'skipped', skip_reason: 'zero_amount',
      amount_eur_gross: 0, split_reward_eur: 0, split_adya_eur: 0, split_asso_eur: 0, split_sasu_eur: 0,
    })
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  it('confirms invoice accounting after its profile, number and payment are confirmed', async () => {
    const event = invoiceEvent('invoice.payment_succeeded')
    expect((await deliver({ event })).response.status).toBe(200)
    expect((await deliver({ ingress: 'internal', event })).response.status).toBe(200)
    expect(fixture.state.profileLookups).toHaveLength(1)
    expect(fixture.state.invoiceNumberAttempts).toHaveLength(1)
    expect(fixture.state.paymentWrites).toHaveLength(1)
    expect(fixture.state.paymentWrites[0]).toMatchObject({
      user_id: USER_ID, stripe_invoice_id: 'in_synthetic', invoice_number: 'SYNTHETIC-INVOICE-1',
      amount: 10, currency: 'EUR', status: 'paid',
    })
    expect(fixture.state.completionAttempts).toHaveLength(1)
  })

  for (const failedBoundary of ['profile lookup', 'invoice number', 'payment insert']) {
    it('does not mark invoice accounting complete after a failed ' + failedBoundary, async () => {
      fixture.state.profileLookupError = failedBoundary === 'profile lookup'
      fixture.state.invoiceNumberError = failedBoundary === 'invoice number'
      fixture.state.paymentError = failedBoundary === 'payment insert'
      assertRetryable((await deliver({ event: invoiceEvent('invoice.payment_succeeded') })).response.status)
      expect(fixture.state.profileLookups).toHaveLength(1)
      expect(fixture.state.invoiceNumberAttempts).toHaveLength(failedBoundary === 'profile lookup' ? 0 : 1)
      expect(fixture.state.paymentAttempts).toHaveLength(failedBoundary === 'payment insert' ? 1 : 0)
      expect(fixture.state.paymentWrites).toHaveLength(0)
      assertNoCompletion()
    })
  }
})


describe('configured Stripe mode is admitted before database access', () => {
  function setApiKey(key: string) {
    vi.stubEnv('STRIPE_SECRET_KEY', key)
    fixture.state.stripe = new Stripe(key)
  }

  function modeEvent(livemode: boolean, objectMode: unknown = livemode): JsonRecord {
    const event = checkoutEvent()
    event.livemode = livemode
    ;((event.data as JsonRecord).object as JsonRecord).livemode = objectMode
    return event
  }

  function assertNoDatabaseAccess() {
    expect(fixture.state.serviceClientCalls).toBe(0)
    expect(fixture.state.claimAttempts).toHaveLength(0)
    expect(fixture.state.claims.size).toBe(0)
    assertNoEffects()
    assertNoCompletion()
  }

  for (const ingress of ['public', 'internal'] as const) {
    for (const prefix of ['sk', 'rk']) {
      for (const live of [false, true]) {
        const mode = live ? 'live' : 'test'
        const key = prefix + '_' + mode + '_synthetic_fixture'
        const label = ingress + '/' + prefix + '/' + mode

        it('accepts a signed matching event and its retry: ' + label, async () => {
          setApiKey(key)
          const event = modeEvent(live)
          expect((await deliver({ ingress, event })).response.status).toBe(200)
          const again = await deliver({ ingress, event })
          expect(again.response.status).toBe(200)
          expect(again.body).toEqual({ received: true, duplicate: true })
          expect(fixture.state.profileWrites).toHaveLength(1)
          expect(fixture.state.completionAttempts).toHaveLength(1)
          expect(fixture.state.claims.size).toBe(1)
          expect([...fixture.state.claims.values()][0].identity.livemode).toBe(live)
        })

        it('rejects a validly signed opposite-mode event without claiming it: ' + label, async () => {
          setApiKey(key)
          const result = await deliver({ ingress, event: modeEvent(!live) })
          expect(result.response.status).toBe(503)
          expect(result.body).toEqual({ error: 'webhook_mode_mismatch' })
          assertNoDatabaseAccess()
        })

        it('rejects contradictory signed object mode before a claim: ' + label, async () => {
          setApiKey(key)
          const result = await deliver({ ingress, event: modeEvent(live, !live) })
          expect(result.response.status).toBe(503)
          expect(result.body).toEqual({ error: 'webhook_mode_mismatch' })
          assertNoDatabaseAccess()
        })
      }
    }

    const invalidKeys: Array<[string, string | undefined]> = [
      ['absent', undefined], ['empty', ''], ['whitespace', ' '],
      ['publishable', 'pk_test_synthetic'], ['signing secret', 'whsec_synthetic'],
      ['organization without explicit mode', 'sk_org_synthetic'],
      ['unknown prefix', 'unknown_synthetic'], ['empty test suffix', 'sk_test_'],
      ['empty live suffix', 'sk_live_'], ['embedded whitespace', 'sk_test_synthetic invalid'],
      ['surrounding whitespace', ' sk_test_synthetic '],
    ]
    for (const [label, key] of invalidKeys) {
      it('refuses unavailable configured mode before SDK or database: ' + ingress + '/' + label, async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', key)
        const result = await deliver({ ingress })
        expect(result.response.status).toBe(503)
        expect(result.body).toEqual({ error: 'webhook_configuration_unavailable' })
        expect(fixture.state.stripeClientCalls).toBe(0)
        assertNoDatabaseAccess()
      })
    }

    for (const malformed of [undefined, null, 'false', 0]) {
      it('refuses a signed event with non-boolean mode: ' + ingress + '/' + String(malformed), async () => {
        const event = checkoutEvent()
        event.livemode = malformed
        expect((await deliver({ ingress, event })).response.status).toBe(503)
        assertNoDatabaseAccess()
      })
    }

    for (const malformed of [null, 'false', 0]) {
      it('refuses a signed object with non-boolean mode: ' + ingress + '/' + String(malformed), async () => {
        expect((await deliver({ ingress, event: modeEvent(false, malformed) })).response.status).toBe(503)
        assertNoDatabaseAccess()
      })
    }

    it('still authenticates an opposite-mode event before inspecting its mode: ' + ingress, async () => {
      const result = await deliver({ ingress, event: modeEvent(true), validSignature: false })
      expect(result.response.status).toBe(400)
      assertNoDatabaseAccess()
    })
  }

  it('keeps journal modes distinct while blocking a mismatch before configuration changes', async () => {
    // A subscription event isolates journal identity from the independent
    // checkout welcome-bonus guard, which must reject ambiguous prior effects.
    function subscriptionModeEvent(livemode: boolean): JsonRecord {
      return { ...modeEvent(livemode), type: 'customer.subscription.deleted', data: { object: {
        id: 'sub_synthetic', object: 'subscription', customer: 'cus_synthetic', livemode,
      } } }
    }
    const first = subscriptionModeEvent(false)
    expect((await deliver({ ingress: 'public', event: first })).response.status).toBe(200)
    const opposite = subscriptionModeEvent(true)
    const before = fixture.state.serviceClientCalls
    expect((await deliver({ ingress: 'internal', event: opposite })).response.status).toBe(503)
    expect(fixture.state.serviceClientCalls).toBe(before)
    expect(fixture.state.claims.size).toBe(1)
    setApiKey('sk_live_synthetic_fixture')
    expect((await deliver({ ingress: 'internal', event: opposite })).response.status).toBe(200)
    expect(fixture.state.claims.size).toBe(2)
    expect(fixture.state.profileWrites).toHaveLength(2)
    expect(fixture.state.completionAttempts).toHaveLength(2)
  })
})
