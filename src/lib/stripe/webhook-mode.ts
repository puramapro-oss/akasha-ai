import type Stripe from 'stripe'

export type StripeWebhookMode = 'test' | 'live'

/** A signing secret authenticates a payload; it does not select its API mode. */
export function configuredStripeWebhookMode(): StripeWebhookMode | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (typeof key !== 'string') return null
  const mode = /^(?:sk|rk)_(test|live)_\S+$/.exec(key)?.[1]
  return mode === 'test' || mode === 'live' ? mode : null
}

/** Only inspect an event after signature and envelope validation. */
export function stripeWebhookModeMatches(event: Stripe.Event, expected: StripeWebhookMode): boolean {
  if ((expected !== 'test' && expected !== 'live')
      || typeof event.livemode !== 'boolean'
      || event.livemode !== (expected === 'live')) return false
  const object = event.data.object
  // Some Stripe objects (for example accounts) do not carry their own mode.
  // When a mode is present, it must agree with the authenticated envelope.
  return !object || typeof object !== 'object' || !Object.hasOwn(object, 'livemode')
    || (typeof (object as { livemode?: unknown }).livemode === 'boolean'
      && (object as { livemode?: unknown }).livemode === event.livemode)
}
