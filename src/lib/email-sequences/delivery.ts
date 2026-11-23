import { createHash, randomUUID } from 'node:crypto'
import type { Resend } from 'resend'
import type { createServiceClient } from '@/lib/supabase'
import { APP_NAME } from '@/lib/constants'
import { buildEmailHtml, type EMAIL_SEQUENCE } from './templates'
import type { EmailRunBudget } from '@/lib/email-sequence-recipients'

type Client = ReturnType<typeof createServiceClient>
type Sequence = (typeof EMAIL_SEQUENCE)[number]
export type Recipient = { id: string; email: string; display_name: string | null }
type Identity = { user_id: string; email_type: string; attempt_token: string; payload_hash: string }
export type DeliveryResult = 'sent' | 'skipped' | 'failed' | 'reconciliation_required'
const RPC_TIMEOUT_MS = 10_000
const PROVIDER_TIMEOUT_MS = 20_000

function receipt(data: unknown, identity: Identity): data is Identity & { status: string; provider_email_id?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const value = data as Record<string, unknown>
  return value.version === 1 && typeof value.status === 'string'
    && Object.entries(identity).every(([key, expected]) => value[key] === expected)
}

// A deadline never releases the durable claim. The provider may still finish
// after our wait ends; a later cron must not start a second external effect.
async function providerResult<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Email confirmation timeout')), PROVIDER_TIMEOUT_MS)
    })])
  } finally { clearTimeout(timer) }
}

export async function deliverSequence(client: Client, resend: Resend, user: Recipient, seq: Sequence, budget?: EmailRunBudget): Promise<DeliveryResult> {
  const payload = {
    from: `${APP_NAME} <noreply@purama.dev>`, to: user.email,
    subject: `${seq.emoji} ${seq.subject}`, html: buildEmailHtml(seq.type, user.display_name ?? ''),
  }
  const identity: Identity = {
    user_id: user.id, email_type: seq.type, attempt_token: randomUUID(),
    payload_hash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
  const args = {
    p_user_id: identity.user_id, p_email_type: identity.email_type,
    p_attempt_token: identity.attempt_token, p_payload_hash: identity.payload_hash,
  }
  await budget?.beforeReservation()
  try {
    // The SQL authority checks the stored newsletter choice and pause, the
    // current recipient and prior receipts before atomically reserving a send.
    const claim = await client.rpc('claim_email_sequence_delivery', { ...args, p_recipient: user.email })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (claim.error || !receipt(claim.data, identity)) return 'failed'
    if (['not_subscribed', 'paused', 'already_sent'].includes(claim.data.status)) return 'skipped'
    if (claim.data.status === 'reconciliation_required') return 'reconciliation_required'
    if (claim.data.status !== 'claimed') return 'failed'
  } catch { return 'failed' }
  budget?.recordAttempt()

  let providerId: string | null = null
  try {
    const result = await providerResult(resend.emails.send(payload, {
      idempotencyKey: `akasha-email/${seq.type}/${user.id}`,
    }))
    if (budget && result.error && (result.error.statusCode === 429
      || ['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded'].includes(result.error.name))) {
      budget.capacityReached = true
    }
    if (result.error || typeof result.data?.id !== 'string' || !/^[^\s]{1,255}$/.test(result.data.id)) {
      throw new Error('Email acceptance is unconfirmed')
    }
    providerId = result.data.id
    const complete = await client.rpc('complete_email_sequence_delivery', { ...args, p_provider_email_id: providerId })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (complete.error || !receipt(complete.data, identity) || complete.data.status !== 'sent'
      || complete.data.provider_email_id !== providerId) throw new Error('Email receipt is unconfirmed')
    // "sent" means provider acceptance plus its matching durable receipt.
    // Inbox delivery and opening are not established by this result.
    return 'sent'
  } catch {
    try {
      await client.rpc('reconcile_email_sequence_delivery', {
        ...args, p_provider_email_id: providerId,
        p_reason: providerId ? 'completion_unconfirmed' : 'provider_unconfirmed',
      }).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    } catch { /* The original sending claim remains non-replayable even here. */ }
    return 'reconciliation_required'
  }
}

export function utcSignupWindow(now: Date, dayOffset: number): { start: string; end: string } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset)
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() }
}
