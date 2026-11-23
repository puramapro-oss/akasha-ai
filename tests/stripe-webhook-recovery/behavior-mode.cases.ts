import { describe, it, expect, vi } from 'vitest'
import { fixture, type JsonRecord } from './behavior.fixture'
import Stripe from 'stripe'
import { checkoutEvent, deliver, assertNoEffects, assertNoCompletion } from './behavior.harness'

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
