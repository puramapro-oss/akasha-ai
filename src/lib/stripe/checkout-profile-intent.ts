import { createHash } from 'node:crypto'

export type CheckoutProfileIntent = {
  customerId: string
  subscriptionId: string
  plan: string | null
  tier: string | null
}

/**
 * Versioned, UTF-8 length-framed values, shared with the completion RPC.
 * Null is distinct from an empty string. Delivery time is deliberately absent.
 * The caller preserves the existing rule: write plan/tier only as a full pair.
 */
export function checkoutProfileIntentSha256(intent: CheckoutProfileIntent): string {
  const framed = [intent.customerId, intent.subscriptionId, intent.plan, intent.tier]
    .map(value => value === null ? 'n;' : Buffer.byteLength(value, 'utf8') + ':' + value + ';').join('')
  return createHash('sha256').update('akasha-checkout-profile-v1;' + framed, 'utf8').digest('hex')
}
