import { createHash } from 'node:crypto'
import type Stripe from 'stripe'

type JsonObject = Record<string, unknown>
type JournalState = 'processing' | 'completed' | 'reconciliation_required'

export interface StripeWebhookIdentity {
  stripe_account_key: string
  livemode: boolean
  event_id: string
  fingerprint: string
}

export interface StripeWebhookEnvelope extends StripeWebhookIdentity {
  version: 1
  event_type: string
  event_created: number
  api_version: string | null
  event_data: JsonObject
}

interface JournalStore {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface StripeWebhookAdmission {
  admitted: boolean
  state: JournalState
  legacy: boolean
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid webhook journal object')
  }
  return value as JsonObject
}

function boundedText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new Error('Invalid webhook journal text')
  }
  return value
}

// Only immutable event semantics participate. Delivery metadata such as
// request and pending_webhooks, and the original JSON whitespace/key order, do not.
function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error('Webhook event is too deeply nested')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(item => canonicalJson(item, depth + 1)).join(',') + ']'
  }
  const record = object(value)
  return '{' + Object.keys(record).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalJson(record[key], depth + 1)
  ).join(',') + '}'
}

/** Call only after the original body has passed Stripe signature verification. */
export function stripeWebhookEnvelope(event: Stripe.Event): StripeWebhookEnvelope {
  const eventId = boundedText(event.id)
  if (!eventId.startsWith('evt_') || typeof event.livemode !== 'boolean'
      || !Number.isSafeInteger(event.created) || event.created < 0) {
    throw new Error('Invalid authenticated Stripe event envelope')
  }
  const semantic = {
    version: 1 as const,
    stripe_account_key: event.account == null ? 'platform' : boundedText(event.account),
    livemode: event.livemode,
    event_id: eventId,
    event_type: boundedText(event.type),
    event_created: event.created,
    api_version: event.api_version == null ? null : boundedText(event.api_version),
    event_data: object(event.data),
  }
  const canonical = canonicalJson(semantic)
  if (Buffer.byteLength(canonical, 'utf8') > 120_000) {
    throw new Error('Webhook event exceeds the journal bound')
  }
  return { ...semantic, fingerprint: createHash('sha256').update(canonical).digest('hex') }
}

export function stripeWebhookIdentity(event: StripeWebhookEnvelope): StripeWebhookIdentity {
  return {
    stripe_account_key: event.stripe_account_key,
    livemode: event.livemode,
    event_id: event.event_id,
    fingerprint: event.fingerprint,
  }
}

function sameIdentity(receipt: JsonObject, identity: StripeWebhookIdentity): boolean {
  return receipt.stripe_account_key === identity.stripe_account_key
    && receipt.livemode === identity.livemode
    && receipt.event_id === identity.event_id
    && receipt.fingerprint === identity.fingerprint
}

export async function admitStripeWebhookEvent(
  db: JournalStore, event: StripeWebhookEnvelope, attemptToken: string,
): Promise<StripeWebhookAdmission> {
  const { data, error } = await db.rpc('admit_stripe_webhook_event', {
    p_event: event, p_attempt_token: attemptToken,
  })
  if (error) throw new Error('Webhook admission was not confirmed')
  const receipt = object(data)
  if (!sameIdentity(receipt, event) || typeof receipt.admitted !== 'boolean'
      || typeof receipt.legacy !== 'boolean'
      || !['processing', 'completed', 'reconciliation_required'].includes(String(receipt.state))
      || (receipt.admitted
        ? receipt.state !== 'processing' || receipt.legacy || receipt.attempt_token !== attemptToken
        : receipt.attempt_token !== null)
      || (receipt.legacy && receipt.state !== 'reconciliation_required')) {
    throw new Error('Webhook admission receipt is inconsistent')
  }
  return {
    admitted: receipt.admitted,
    state: receipt.state as JournalState,
    legacy: receipt.legacy,
  }
}

export async function completeStripeWebhookEvent(
  db: JournalStore, identity: StripeWebhookIdentity, attemptToken: string,
): Promise<void> {
  const { data, error } = await db.rpc('complete_stripe_webhook_event', {
    p_identity: identity, p_attempt_token: attemptToken,
  })
  if (error) throw new Error('Webhook completion was not confirmed')
  const receipt = object(data)
  if (!sameIdentity(receipt, identity) || receipt.completed !== true
      || receipt.attempt_token !== attemptToken) {
    throw new Error('Webhook completion receipt is inconsistent')
  }
}

export async function reconcileStripeWebhookEvent(
  db: JournalStore, identity: StripeWebhookIdentity, attemptToken: string,
  reason: 'effect_failed' | 'completion_unconfirmed',
): Promise<void> {
  const { data, error } = await db.rpc('reconcile_stripe_webhook_event', {
    p_identity: identity, p_attempt_token: attemptToken, p_reason: reason,
  })
  if (error) throw new Error('Webhook reconciliation state was not confirmed')
  const receipt = object(data)
  if (!sameIdentity(receipt, identity) || receipt.recorded !== true
      || receipt.attempt_token !== attemptToken
      || !['reconciliation_required', 'completed'].includes(String(receipt.state))) {
    throw new Error('Webhook reconciliation receipt is inconsistent')
  }
}
