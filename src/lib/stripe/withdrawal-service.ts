import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import {
  WithdrawalFailure, activeWithdrawalResult, parseWithdrawalReceipt, readActiveWithdrawal,
  readWithdrawal, withdrawalResult, withdrawalRpc,
  type WithdrawalDatabase, type WithdrawalIdentity, type WithdrawalReceipt, type WithdrawalResult,
} from './withdrawal-contract'

export type CreateWithdrawalTransfer = (
  params: Stripe.TransferCreateParams, options: Stripe.RequestOptions,
) => Promise<Stripe.Transfer>
interface WithdrawalDependencies { db: WithdrawalDatabase; createTransfer: CreateWithdrawalTransfer }
export interface WithdrawalAdmission extends WithdrawalIdentity {
  amount: number
  destination: string
  fraudMetadata: Record<string, unknown>
  dailyCap: number | null
}
const provenRejections = new Set([
  'balance_insufficient', 'amount_too_small', 'amount_too_large',
  'resource_missing', 'parameter_missing', 'parameter_invalid_integer',
  'parameter_invalid_empty', 'parameter_unknown', 'transfers_not_allowed',
])

/** Only an authenticated SDK rejection with a specific non-execution code permits refund. */
function rejectionCode(error: unknown): string | null {
  if (!(error instanceof Stripe.errors.StripeInvalidRequestError)
      || error.statusCode !== 400 || typeof error.requestId !== 'string' || !error.requestId
      || typeof error.code !== 'string' || !provenRejections.has(error.code)) return null
  return error.code
}

function confirmedTransfer(transfer: Stripe.Transfer, row: WithdrawalReceipt): boolean {
  const destination = typeof transfer.destination === 'string'
    ? transfer.destination : transfer.destination?.id
  return transfer.object === 'transfer' && /^tr_[A-Za-z0-9]+$/.test(transfer.id)
    && transfer.amount === Math.round(row.amount_eur * 100) && transfer.currency === 'eur'
    && destination === row.destination && transfer.livemode === (row.mode === 'live')
    && transfer.reversed === false && transfer.amount_reversed === 0
    && transfer.metadata?.user_id === row.user_id
    && transfer.metadata?.withdrawal_request_id === row.request_id
    && transfer.metadata?.app === 'akasha_ai'
}

function sameOperation(observed: WithdrawalReceipt, expected: WithdrawalReceipt): boolean {
  return observed.request_id === expected.request_id && observed.amount_eur === expected.amount_eur
    && observed.destination === expected.destination && observed.attempt_token === expected.attempt_token
}

async function reconcile(
  db: WithdrawalDatabase, identity: WithdrawalIdentity, row: WithdrawalReceipt,
  attemptToken: string,
): Promise<WithdrawalResult> {
  try {
    const raw = await withdrawalRpc(db, 'reconcile_akasha_withdrawal', {
      p_user_id: identity.userId, p_request_key: identity.requestKey, p_attempt_token: attemptToken,
    })
    const observed = parseWithdrawalReceipt(raw, identity)
    if (!sameOperation(observed, row)) throw new WithdrawalFailure('withdrawal_receipt_unconfirmed')
    return withdrawalResult(observed, true)
  } catch {
    // A committed completion/compensation may have lost only its response.
    try {
      const existing = await readWithdrawal(db, identity)
      if (existing && sameOperation(existing, row)) return withdrawalResult(existing, true)
    } catch { /* Nothing is claimed when persistence cannot be observed. */ }
    return withdrawalResult(row)
  }
}

export async function resumeWithdrawal(
  dependencies: WithdrawalDependencies, identity: WithdrawalIdentity, existing: WithdrawalReceipt,
): Promise<WithdrawalResult> {
  if (existing.state !== 'reserved') return withdrawalResult(existing, true)
  const attemptToken = randomUUID()
  const raw = await withdrawalRpc(dependencies.db, 'claim_akasha_withdrawal', {
    p_user_id: identity.userId, p_request_key: identity.requestKey, p_attempt_token: attemptToken,
  })
  const claimed = parseWithdrawalReceipt(raw, identity)
  if (claimed.request_id !== existing.request_id || claimed.amount_eur !== existing.amount_eur
      || claimed.destination !== existing.destination) {
    throw new WithdrawalFailure('withdrawal_claim_unconfirmed')
  }
  if (!claimed.send_authorized) return withdrawalResult(claimed, true)
  if (claimed.state !== 'sending' || claimed.attempt_token !== attemptToken
      || claimed.request_id !== existing.request_id || claimed.amount_eur !== existing.amount_eur
      || claimed.destination !== existing.destination) {
    throw new WithdrawalFailure('withdrawal_claim_unconfirmed')
  }
  let transfer: Stripe.Transfer
  try {
    transfer = await dependencies.createTransfer({
      amount: Math.round(claimed.amount_eur * 100), currency: 'eur',
      destination: claimed.destination, description: 'Retrait wallet AKASHA',
      metadata: { user_id: identity.userId, app: 'akasha_ai',
        source: 'connect_withdraw', withdrawal_request_id: claimed.request_id },
    }, { idempotencyKey: 'akasha-withdrawal:' + claimed.request_id, maxNetworkRetries: 0, timeout: 20_000 })
  } catch (error) {
    const code = rejectionCode(error)
    if (code) {
      try {
        const rejected = parseWithdrawalReceipt(await withdrawalRpc(dependencies.db,
          'reject_akasha_withdrawal', { p_user_id: identity.userId,
            p_request_key: identity.requestKey, p_attempt_token: attemptToken, p_failure_code: code,
          }), identity)
        if (rejected.state !== 'rejected' || rejected.attempt_token !== attemptToken
            || rejected.request_id !== claimed.request_id || rejected.amount_eur !== claimed.amount_eur
            || rejected.destination !== claimed.destination || rejected.failure_code !== code) {
          throw new WithdrawalFailure('withdrawal_rejection_unconfirmed')
        }
        return withdrawalResult(rejected)
      } catch { return reconcile(dependencies.db, identity, claimed, attemptToken) }
    }
    return reconcile(dependencies.db, identity, claimed, attemptToken)
  }
  if (!confirmedTransfer(transfer, claimed)) {
    return reconcile(dependencies.db, identity, claimed, attemptToken)
  }
  try {
    const completed = parseWithdrawalReceipt(await withdrawalRpc(dependencies.db,
      'complete_akasha_withdrawal', {
        p_user_id: identity.userId, p_request_key: identity.requestKey,
        p_attempt_token: attemptToken, p_transfer_id: transfer.id,
        p_amount_eur: claimed.amount_eur, p_destination: claimed.destination, p_mode: identity.mode,
      }), identity)
    if (completed.state !== 'completed' || completed.transfer_id !== transfer.id
        || completed.attempt_token !== attemptToken || completed.request_id !== claimed.request_id
        || completed.amount_eur !== claimed.amount_eur || completed.destination !== claimed.destination) {
      throw new WithdrawalFailure('withdrawal_completion_unconfirmed')
    }
    return withdrawalResult(completed)
  } catch { return reconcile(dependencies.db, identity, claimed, attemptToken) }
}

export async function admitWithdrawal(
  dependencies: WithdrawalDependencies, admission: WithdrawalAdmission,
): Promise<WithdrawalResult> {
  let raw: unknown
  try {
    raw = await withdrawalRpc(dependencies.db, 'reserve_akasha_withdrawal', {
      p_user_id: admission.userId, p_request_key: admission.requestKey,
      p_amount_eur: admission.amount, p_requested_amount_eur: admission.requestedAmount,
      p_stripe_account_id: admission.destination, p_mode: admission.mode,
      p_fraud_metadata: admission.fraudMetadata, p_daily_cap: admission.dailyCap,
    })
  } catch (error) {
    if (error instanceof WithdrawalFailure && error.code === 'withdrawal_in_progress') {
      const active = await readActiveWithdrawal(dependencies.db, admission.userId, admission.mode)
      if (active) return activeWithdrawalResult(active, admission.requestKey)
    }
    throw error
  }
  const reserved = parseWithdrawalReceipt(raw, admission)
  if (reserved.amount_eur !== admission.amount || reserved.destination !== admission.destination) {
    throw new WithdrawalFailure('withdrawal_admission_unconfirmed')
  }
  return resumeWithdrawal(dependencies, admission, reserved)
}
