import { describe, it, expect } from 'vitest'
import { fixture, type JsonRecord } from './behavior.fixture'
import { createHash } from 'node:crypto'
import { EVENT_ID, USER_ID, EVENT_CREATED, checkoutEvent, deliver, assertRetryable, assertNoEffects, assertNoCompletion, canonical, reverseKeys } from './behavior.harness'

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
