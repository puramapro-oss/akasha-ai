import { vi } from 'vitest'
import type Stripe from 'stripe'
import { fixture } from './behavior.fixture'

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

// Keep one discovered entrypoint, the original mocks and registration order.
import './behavior-recovery.cases'
import './behavior-ingress.cases'
import './behavior-identity.cases'
import './behavior-confirmation.cases'
import './behavior-mode.cases'
