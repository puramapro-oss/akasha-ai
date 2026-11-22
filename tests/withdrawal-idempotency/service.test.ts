import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import type { PGlite } from '@electric-sql/pglite'
import { admitWithdrawal, resumeWithdrawal, type CreateWithdrawalTransfer } from '../../src/lib/stripe/withdrawal-service'
import { readWithdrawal, withdrawalRpc, WITHDRAWAL_RPC_TIMEOUT_MS,
  type WithdrawalDatabase } from '../../src/lib/stripe/withdrawal-contract'
import { bridge, database, identity, reset, snapshot } from './fixture'

export function transferFor(params: Stripe.TransferCreateParams): Stripe.Transfer {
  return { id: 'tr_synthetic', object: 'transfer', amount: params.amount,
    amount_reversed: 0, currency: 'eur', destination: params.destination, livemode: false,
    reversed: false, metadata: params.metadata ?? {},
  } as Stripe.Transfer
}
const admission = { ...identity, amount: 20, destination: 'acct_synthetic', fraudMetadata: {}, dailyCap: 50 }

describe('Real withdrawal service with real in-memory SQL and synthetic Stripe transport', () => {
  let db: PGlite
  beforeAll(async () => { db = await database() })
  beforeEach(async () => { await reset(db) })
  afterEach(() => { vi.useRealTimers() })
  afterAll(async () => { await db?.close() })
  const sender = () => vi.fn<CreateWithdrawalTransfer>(async params => transferFor(params))

  it('confirms the durable receipt; repeated delivery never calls the provider again', async () => {
    const createTransfer = sender()
    const dependencies = { db: bridge(db), createTransfer }
    expect((await admitWithdrawal(dependencies, admission)).status).toBe(200)
    const row = await readWithdrawal(dependencies.db, identity)
    expect((await resumeWithdrawal(dependencies, identity, row!)).status).toBe(200)
    expect(createTransfer).toHaveBeenCalledTimes(1)
    expect(createTransfer.mock.calls[0][1]).toMatchObject({ maxNetworkRetries: 0, timeout: 20_000 })
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00')
    expect(state.receipts).toHaveLength(1)
  })
  it.each(['network_timeout', 'unknown_500'])('an ambiguous %s never refunds or resends', async error => {
    const createTransfer = vi.fn<CreateWithdrawalTransfer>(async () => { throw new Error(error) })
    const dependencies = { db: bridge(db), createTransfer }
    expect((await admitWithdrawal(dependencies, admission)).body).toMatchObject({
      ok: false, operation_state: 'reconciliation',
    })
    const row = await readWithdrawal(dependencies.db, identity)
    expect((await resumeWithdrawal(dependencies, identity, row!)).status).toBe(503)
    expect(createTransfer).toHaveBeenCalledTimes(1)
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00'); expect(state.receipts).toHaveLength(0)
  })
  it('a proven SDK rejection restores exactly once and says so only after SQL confirmation', async () => {
    const createTransfer = vi.fn<CreateWithdrawalTransfer>(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error',
        code: 'balance_insufficient', statusCode: 400, requestId: 'req_synthetic' })
    })
    const dependencies = { db: bridge(db), createTransfer }
    const result = await admitWithdrawal(dependencies, admission)
    expect(result.body).toMatchObject({ operation_state: 'rejected', balance_restored: true })
    const row = await readWithdrawal(dependencies.db, identity)
    await resumeWithdrawal(dependencies, identity, row!)
    expect(createTransfer).toHaveBeenCalledTimes(1)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
  })
  it('a generic object posing as a refusal cannot authorize compensation', async () => {
    const createTransfer = vi.fn<CreateWithdrawalTransfer>(async () => {
      throw { type: 'StripeInvalidRequestError', code: 'balance_insufficient', statusCode: 400, requestId: 'req_fake' }
    })
    expect((await admitWithdrawal({ db: bridge(db), createTransfer }, admission)).body)
      .toMatchObject({ operation_state: 'reconciliation' })
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it.each([
    { amount: 2001 }, { currency: 'usd' }, { destination: 'acct_other' },
    { livemode: true }, { reversed: true }, { metadata: {} },
  ])('refuses mismatched provider evidence %j', async change => {
    const createTransfer = vi.fn<CreateWithdrawalTransfer>(async params => ({ ...transferFor(params), ...change }) as Stripe.Transfer)
    const result = await admitWithdrawal({ db: bridge(db), createTransfer }, admission)
    expect(result.body).toMatchObject({ operation_state: 'reconciliation' })
    expect((await snapshot(db)).receipts).toHaveLength(0)
    expect(createTransfer).toHaveBeenCalledTimes(1)
  })
  it('a failed receipt write is not a successful withdrawal or a reason to refund', async () => {
    const real = bridge(db)
    const wrapped: WithdrawalDatabase = { rpc: (name, args) => name === 'complete_akasha_withdrawal'
      ? Promise.resolve({ data: null, error: { message: 'receipt denied' } }) : real.rpc(name, args) }
    const createTransfer = sender()
    const result = await admitWithdrawal({ db: wrapped, createTransfer }, admission)
    expect(result.status).toBe(503); expect(result.body.balance_restored).not.toBe(true)
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00'); expect(state.receipts).toHaveLength(0)
  })
  it('failed compensation never claims that the balance was restored', async () => {
    const real = bridge(db)
    const wrapped: WithdrawalDatabase = { rpc: (name, args) => name === 'reject_akasha_withdrawal'
      ? Promise.resolve({ data: null, error: { message: 'compensation denied' } }) : real.rpc(name, args) }
    const createTransfer = vi.fn<CreateWithdrawalTransfer>(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error',
        code: 'balance_insufficient', statusCode: 400, requestId: 'req_synthetic' })
    })
    const result = await admitWithdrawal({ db: wrapped, createTransfer }, admission)
    expect(result.status).toBe(503); expect(result.body.balance_restored).not.toBe(true)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('a lost completion acknowledgement is recovered from the persisted receipt', async () => {
    const real = bridge(db)
    const wrapped: WithdrawalDatabase = { async rpc(name, args) {
      const result = await real.rpc(name, args)
      return name === 'complete_akasha_withdrawal'
        ? { data: null, error: { message: 'response lost after commit' } } : result
    } }
    const createTransfer = sender()
    expect((await admitWithdrawal({ db: wrapped, createTransfer }, admission)).status).toBe(200)
    expect(createTransfer).toHaveBeenCalledTimes(1)
    expect((await snapshot(db)).receipts).toHaveLength(1)
  })
  it('a lost claim acknowledgement consumes permission but never sends blindly', async () => {
    const real = bridge(db)
    const wrapped: WithdrawalDatabase = { async rpc(name, args) {
      const result = await real.rpc(name, args)
      return name === 'claim_akasha_withdrawal'
        ? { data: null, error: { message: 'response lost after commit' } } : result
    } }
    const createTransfer = sender()
    await expect(admitWithdrawal({ db: wrapped, createTransfer }, admission)).rejects.toMatchObject({
      code: 'withdrawal_outcome_unconfirmed',
    })
    const row = await readWithdrawal(real, identity)
    expect((await resumeWithdrawal({ db: real, createTransfer }, identity, row!)).status).toBe(503)
    expect(createTransfer).not.toHaveBeenCalled()
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('bounds an indefinitely pending RPC and clears its timer', async () => {
    vi.useFakeTimers()
    const pending: WithdrawalDatabase = { rpc: () => new Promise(() => {}) }
    const result = withdrawalRpc(pending, 'get_akasha_withdrawal', {})
    const assertion = expect(result).rejects.toMatchObject({ code: 'withdrawal_outcome_unconfirmed' })
    await vi.advanceTimersByTimeAsync(WITHDRAWAL_RPC_TIMEOUT_MS)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('a late RPC response does not restart its caller or authorize another mutation', async () => {
    vi.useFakeTimers()
    let resolve!: (value: { data: unknown; error: null }) => void
    let completed = false
    const pending: WithdrawalDatabase = { rpc: vi.fn(() =>
      new Promise<{ data: unknown; error: null }>(yes => { resolve = yes })) }
    const result = withdrawalRpc(pending, 'reserve_akasha_withdrawal', {}).then(() => { completed = true })
    const assertion = expect(result).rejects.toMatchObject({ code: 'withdrawal_outcome_unconfirmed' })
    await vi.advanceTimersByTimeAsync(WITHDRAWAL_RPC_TIMEOUT_MS); await assertion
    resolve({ data: { state: 'reserved' }, error: null })
    await Promise.resolve()
    expect(completed).toBe(false); expect(pending.rpc).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
