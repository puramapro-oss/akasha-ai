import { describe, it, expect } from 'vitest'
import { fixture } from './behavior.fixture'
import { deliver, assertRetryable, assertNoEffects, assertNoCompletion } from './behavior.harness'

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
