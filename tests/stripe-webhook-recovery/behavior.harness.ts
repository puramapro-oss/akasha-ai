import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { writeFileSync } from 'node:fs'
import { fixture, type JsonRecord, type Barrier } from './behavior.fixture'
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

export { TEST_API_KEY, SECRET, INTERNAL_SECRET, EVENT_ID, USER_ID, EVENT_CREATED, checkoutEvent, invoiceEvent, deliver, assertRetryable, assertNoEffects, assertNoCompletion, counts, makeBarrier, canonical, reverseKeys }
