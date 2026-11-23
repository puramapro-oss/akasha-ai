import { describe, it, expect } from 'vitest'
import { fixture, type JsonRecord } from './behavior.fixture'
import { USER_ID, invoiceEvent, deliver, assertRetryable, assertNoCompletion, counts } from './behavior.harness'

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
