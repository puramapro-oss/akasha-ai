import { z } from 'zod'

export type WithdrawalMode = 'test' | 'live'
export interface WithdrawalIdentity {
  userId: string
  requestKey: string
  requestedAmount: number | null
  mode: WithdrawalMode
}
export interface WithdrawalDatabase {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { message?: string } | null
  }>
}
const money = z.number().finite().nonnegative().refine(value =>
  Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001)
const receiptSchema = z.object({
  request_id: z.uuid(), user_id: z.uuid(), request_key: z.uuid(),
  amount_eur: money.refine(value => value >= 20),
  requested_amount_eur: money.nullable(),
  destination: z.string().regex(/^acct_[A-Za-z0-9]+$/).max(255),
  mode: z.enum(['test', 'live']),
  state: z.enum(['reserved', 'sending', 'completed', 'rejected', 'reconciliation']),
  attempt_token: z.uuid().nullable(),
  transfer_id: z.string().regex(/^tr_[A-Za-z0-9]+$/).max(255).nullable(),
  new_balance_eur: money, restored_balance_eur: money.nullable(),
  failure_code: z.string().max(160).nullable(),
  send_authorized: z.boolean().optional(),
}).superRefine((row, context) => {
  if ((row.requested_amount_eur !== null && row.requested_amount_eur !== row.amount_eur)
      || (row.state === 'reserved' && row.attempt_token !== null)
      || (row.state !== 'reserved' && row.attempt_token === null)
      || (row.state === 'completed' && !row.transfer_id)
      || (row.state !== 'completed' && row.transfer_id !== null)
      || (row.state === 'rejected' && (row.restored_balance_eur === null || !row.failure_code))) {
    context.addIssue({ code: 'custom', message: 'Inconsistent withdrawal receipt' })
  }
})
export type WithdrawalReceipt = z.infer<typeof receiptSchema>
export interface WithdrawalResult { status: number; body: Record<string, unknown> }
export const WITHDRAWAL_RPC_TIMEOUT_MS = 10_000

export class WithdrawalFailure extends Error {
  constructor(
    readonly code: string,
    readonly status = 503,
    message = 'Le retrait ne peut pas être confirmé. Conserve cette demande pour vérifier son état.',
  ) { super(message) }
}

export function parseWithdrawalReceipt(raw: unknown, identity: WithdrawalIdentity): WithdrawalReceipt {
  const parsed = receiptSchema.safeParse(raw)
  if (!parsed.success) throw new WithdrawalFailure('withdrawal_receipt_unconfirmed')
  const row = parsed.data
  if (row.user_id !== identity.userId || row.request_key !== identity.requestKey
      || row.mode !== identity.mode || row.requested_amount_eur !== identity.requestedAmount) {
    throw new WithdrawalFailure('withdrawal_request_conflict', 409,
      'Cette clé appartient à une autre intention de retrait. Aucun nouveau transfert ne sera lancé.')
  }
  return row
}

export async function withdrawalRpc(
  db: WithdrawalDatabase, name: string, args: Record<string, unknown>,
): Promise<unknown> {
  let result: Awaited<ReturnType<WithdrawalDatabase['rpc']>>
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    result = await Promise.race([
      Promise.resolve().then(() => db.rpc(name, args)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new WithdrawalFailure('withdrawal_outcome_unconfirmed')),
          WITHDRAWAL_RPC_TIMEOUT_MS)
      }),
    ])
  }
  catch { throw new WithdrawalFailure('withdrawal_outcome_unconfirmed') }
  finally { if (timer) clearTimeout(timer) }
  if (!result || result.error) {
    const message = result?.error?.message ?? ''
    if (message.includes('withdrawal_request_conflict')) {
      throw new WithdrawalFailure('withdrawal_request_conflict', 409)
    }
    if (message.includes('withdrawal_request_cancelled')) {
      throw new WithdrawalFailure('withdrawal_request_cancelled', 409,
        'Cette ancienne demande a été annulée. Elle ne peut plus être envoyée.')
    }
    if (message.includes('withdrawal_in_progress')) {
      throw new WithdrawalFailure('withdrawal_in_progress', 409,
        'Un retrait attend déjà une confirmation. Vérifie la demande existante avant d’en créer une autre.')
    }
    if (message.includes('withdrawal_daily_cap_exceeded')) {
      throw new WithdrawalFailure('withdrawal_daily_cap_exceeded', 403,
        'Le plafond de retrait pour cette journée est atteint.')
    }
    if (message.includes('insufficient_balance')) {
      throw new WithdrawalFailure('insufficient_balance', 400, 'Solde insuffisant.')
    }
    if (message.includes('withdrawal_history_ambiguous')) {
      throw new WithdrawalFailure('withdrawal_history_ambiguous', 503,
        'Les retraits précédents doivent être rapprochés avant une nouvelle demande.')
    }
    throw new WithdrawalFailure('withdrawal_outcome_unconfirmed')
  }
  return result.data
}

export async function readWithdrawal(
  db: WithdrawalDatabase, identity: WithdrawalIdentity,
): Promise<WithdrawalReceipt | null> {
  const raw = await withdrawalRpc(db, 'get_akasha_withdrawal', {
    p_user_id: identity.userId, p_request_key: identity.requestKey,
  })
  return raw === null ? null : parseWithdrawalReceipt(raw, identity)
}

export async function cancelWithdrawal(
  db: WithdrawalDatabase, identity: WithdrawalIdentity,
): Promise<WithdrawalResult> {
  const raw = await withdrawalRpc(db, 'cancel_akasha_withdrawal', {
    p_user_id: identity.userId, p_request_key: identity.requestKey,
  })
  const result = z.discriminatedUnion('cancelled', [
    z.object({ cancelled: z.literal(true), cancellation_id: z.uuid(), user_id: z.uuid(), request_key: z.uuid() }),
    z.object({ cancelled: z.literal(false), receipt: z.unknown() }),
  ]).safeParse(raw)
  if (!result.success) throw new WithdrawalFailure('withdrawal_cancellation_unconfirmed')
  if (!result.data.cancelled) {
    const row = parseWithdrawalReceipt(result.data.receipt, identity)
    return withdrawalResult(row, true)
  }
  if (result.data.user_id !== identity.userId || result.data.request_key !== identity.requestKey) {
    throw new WithdrawalFailure('withdrawal_cancellation_unconfirmed')
  }
  return { status: 200, body: { ok: true, operation_state: 'cancelled', cancellation_confirmed: true,
    cancellation_id: result.data.cancellation_id, request_key: result.data.request_key,
    owner_id: result.data.user_id } }
}

export async function readActiveWithdrawal(
  db: WithdrawalDatabase, userId: string, mode: WithdrawalMode,
): Promise<WithdrawalReceipt | null> {
  const raw = await withdrawalRpc(db, 'get_akasha_withdrawal', {
    p_user_id: userId, p_request_key: null,
  })
  if (raw === null) return null
  const parsed = receiptSchema.safeParse(raw)
  if (!parsed.success || !['reserved', 'sending', 'reconciliation'].includes(parsed.data.state)) {
    throw new WithdrawalFailure('withdrawal_receipt_unconfirmed')
  }
  return parseWithdrawalReceipt(parsed.data, { userId, mode, requestKey: parsed.data.request_key,
    requestedAmount: parsed.data.requested_amount_eur })
}

export function activeWithdrawalResult(row: WithdrawalReceipt, requestKey: string): WithdrawalResult {
  const result = withdrawalResult(row)
  return { ...result, body: { ...result.body, supersedes_request_key: requestKey,
    active_request: { owner_id: row.user_id, request_key: row.request_key,
      amount_eur: row.amount_eur, requested_amount_eur: row.requested_amount_eur } } }
}

export function withdrawalResult(row: WithdrawalReceipt, replayed = false): WithdrawalResult {
  const identity = { request_id: row.request_id, request_key: row.request_key,
    operation_state: row.state, replayed }
  if (row.state === 'completed') return { status: 200, body: {
    ...identity, ok: true, transfer_id: row.transfer_id, amount_eur: row.amount_eur,
    status: 'pending', new_balance_eur: row.new_balance_eur,
  } }
  if (row.state === 'rejected') return { status: 502, body: {
    ...identity, ok: false, amount_eur: row.amount_eur, code: 'stripe_transfer_rejected',
    error: row.failure_code === 'reservation_expired_unsubmitted'
      ? 'Cette demande ancienne n’a pas été envoyée. La restauration de ton solde est confirmée.'
      : 'Le transfert a été refusé. La restauration de ton solde est confirmée.',
    balance_restored: true, new_balance_eur: row.restored_balance_eur,
  } }
  return { status: 503, body: { ...identity, ok: false,
    code: 'withdrawal_reconciliation_required', retry_same_request: true,
    error: 'Ce retrait attend une confirmation. Vérifie cette demande ; aucun nouveau transfert ne sera relancé.',
  } }
}
