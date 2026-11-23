import { describe, it, expect, vi } from 'vitest'
import { fixture } from './behavior.fixture'
import { deliver, assertNoEffects, makeBarrier } from './behavior.harness'

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
