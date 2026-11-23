import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { ATTEMPT, KEY, OTHER, SECOND_KEY, USER, bridge, claimArgs, completeArgs,
  database, identity, reserveArgs, reset, snapshot } from './fixture'
import { readWithdrawal } from '../../src/lib/stripe/withdrawal-contract'

describe('Canonical withdrawal SQL, in-memory PostgreSQL; no provider or external DB', () => {
  let db: PGlite
  beforeAll(async () => { db = await database() })
  beforeEach(async () => { await reset(db) })
  afterAll(async () => { await db?.close() })
  const call = (name: string, args: Record<string, unknown>) => bridge(db).rpc(name, args)
  const reserve = (changes: Record<string, unknown> = {}) => call('reserve_akasha_withdrawal', reserveArgs(changes))
  const claim = () => call('claim_akasha_withdrawal', claimArgs)
  const complete = () => call('complete_akasha_withdrawal', completeArgs)

  it('a repeated request debits once and has one immutable receipt', async () => {
    const first = await reserve(); const second = await reserve()
    expect(first.error).toBeNull(); expect(second).toEqual(first)
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00')
    expect(state.requests).toHaveLength(1); expect(state.receipts).toHaveLength(0)
  })
  it.each([
    { p_amount_eur: 30, p_requested_amount_eur: 30 },
    { p_stripe_account_id: 'acct_other' }, { p_mode: 'live' }, { p_requested_amount_eur: null },
  ])('a reused key cannot change its intent %j', async changes => {
    await reserve()
    expect((await reserve(changes)).error?.message).toContain('withdrawal_request_conflict')
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('a distinct key cannot bypass an unresolved request', async () => {
    await reserve()
    expect((await reserve({ p_request_key: SECOND_KEY })).error?.message).toContain('withdrawal_in_progress')
    expect((await snapshot(db)).requests).toHaveLength(1)
  })
  it('claim permission is consumed once even if the same attempt token repeats', async () => {
    await reserve()
    expect((await claim()).data).toMatchObject({ send_authorized: true, state: 'sending' })
    expect((await claim()).data).toMatchObject({ send_authorized: false, state: 'sending' })
  })
  it('completion and shared receipt commit together; replay performs no second write', async () => {
    await reserve(); await claim()
    expect((await complete()).error).toBeNull()
    expect((await complete()).error).toBeNull()
    const state = await snapshot(db)
    expect(state.receipts).toHaveLength(1); expect(state.requests[0].state).toBe('completed')
    expect(state.receipts[0].id).toBe(state.requests[0].id)
    expect(state.balances[0].wallet_balance).toBe('80.00')
  })
  it('reads historical fraud evidence from the real shared metadata column and nested JSON path', async () => {
    await reserve({ p_fraud_metadata: { iban_fingerprint: 'synthetic-fingerprint' } })
    await claim(); await complete(); await db.exec('RESET ROLE')
    const result = await db.query<{ user_id: string; metadata: { fraud: { iban_fingerprint: string } } }>(
      "SELECT user_id, metadata FROM public.connect_withdrawals WHERE user_id <> $1 AND metadata->'fraud'->'iban_fingerprint' IS NOT NULL",
      [OTHER],
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ user_id: USER,
      metadata: { fraud: { iban_fingerprint: 'synthetic-fingerprint' } } })
  })
  it('a completed full-balance request is replayable at zero balance', async () => {
    await reset(db, 20)
    await reserve({ p_requested_amount_eur: null }); await claim(); await complete()
    const receipt = await readWithdrawal(bridge(db), { ...identity, requestedAmount: null })
    expect(receipt).toMatchObject({ state: 'completed', amount_eur: 20, new_balance_eur: 0 })
    expect((await reserve({ p_requested_amount_eur: null })).error).toBeNull()
  })
  it('wrong owner, token, amount, destination or mode never completes an operation', async () => {
    await reserve(); await claim()
    for (const changes of [{ p_user_id: OTHER }, { p_attempt_token: KEY }, { p_amount_eur: 21 },
      { p_destination: 'acct_other' }, { p_mode: 'live' }, { p_transfer_id: null }]) {
      expect((await call('complete_akasha_withdrawal', { ...completeArgs, ...changes })).error).not.toBeNull()
    }
    expect((await snapshot(db)).receipts).toHaveLength(0)
  })
  it('a duplicate external transfer id cannot complete a different intent', async () => {
    await reserve(); await claim(); await complete()
    await reserve({ p_request_key: SECOND_KEY })
    await call('claim_akasha_withdrawal', { ...claimArgs, p_request_key: SECOND_KEY })
    expect((await call('complete_akasha_withdrawal', { ...completeArgs,
      p_request_key: SECOND_KEY })).error?.message).toContain('unique')
    expect((await snapshot(db)).receipts).toHaveLength(1)
  })
  it('proven rejection restores the balance once and confirms the failed receipt', async () => {
    await reserve(); await claim()
    const args = { ...claimArgs, p_failure_code: 'balance_insufficient' }
    expect((await call('reject_akasha_withdrawal', args)).error).toBeNull()
    expect((await call('reject_akasha_withdrawal', args)).error).toBeNull()
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('100.00')
    expect(state.requests[0].state).toBe('rejected'); expect(state.receipts).toHaveLength(1)
  })
  it('an uncertain outcome never allows compensation or another send', async () => {
    await reserve(); await claim(); await call('reconcile_akasha_withdrawal', claimArgs)
    expect((await call('reject_akasha_withdrawal', { ...claimArgs,
      p_failure_code: 'balance_insufficient' })).error).not.toBeNull()
    expect((await claim()).data).toMatchObject({ send_authorized: false })
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('late matching proof can complete a reconciliation without another debit', async () => {
    await reserve(); await claim(); await call('reconcile_akasha_withdrawal', claimArgs)
    expect((await complete()).error).toBeNull()
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('receipt failure rolls back both completion and any compensation', async () => {
    await reserve(); await claim(); await db.exec('RESET ROLE')
    await db.exec("CREATE OR REPLACE FUNCTION public.reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt_fixture_rejected'; END $$;"
      + 'CREATE TRIGGER reject_receipt BEFORE INSERT ON public.connect_withdrawals FOR EACH ROW EXECUTE FUNCTION public.reject_receipt();')
    await db.exec('SET ROLE service_role')
    expect((await complete()).error?.message).toContain('receipt_fixture_rejected')
    expect((await call('reject_akasha_withdrawal', { ...claimArgs,
      p_failure_code: 'balance_insufficient' })).error?.message).toContain('receipt_fixture_rejected')
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00')
    expect(state.requests[0].state).toBe('sending'); expect(state.receipts).toHaveLength(0)
  })
  it('a debit failure creates no request and leaves the balance untouched', async () => {
    await db.exec('RESET ROLE')
    await db.exec("CREATE OR REPLACE FUNCTION public.reject_debit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'debit_fixture_rejected'; END $$;"
      + 'CREATE TRIGGER reject_debit BEFORE UPDATE ON akasha_ai.profiles FOR EACH ROW EXECUTE FUNCTION public.reject_debit();')
    await db.exec('SET ROLE service_role')
    expect((await reserve()).error?.message).toContain('debit_fixture_rejected')
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('100.00'); expect(state.requests).toHaveLength(0)
  })
  it('daily 50-euro cap includes prior completed requests without counting their receipt twice', async () => {
    await reserve(); await claim(); await complete()
    expect((await reserve({ p_request_key: SECOND_KEY,
      p_amount_eur: 30, p_requested_amount_eur: 30 })).error).toBeNull()
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('50.00')
    expect(state.requests).toHaveLength(2)
  })
  it('daily cap cannot be bypassed by a second distinct key', async () => {
    await reserve({ p_amount_eur: 40, p_requested_amount_eur: 40 }); await claim()
    await call('complete_akasha_withdrawal', { ...completeArgs, p_amount_eur: 40 })
    expect((await reserve({ p_request_key: SECOND_KEY })).error?.message).toContain('withdrawal_daily_cap_exceeded')
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('60.00')
  })
  it.each([
    { now: '2026-03-29 23:45:00+00', receipt: '2026-03-29 23:30:00+00', allowed: false },
    { now: '2026-10-25 23:45:00+00', receipt: '2026-10-26 00:30:00+00', allowed: true },
  ])('keeps the UTC day at 24 hours across Europe/Paris DST: $now', async scenario => {
    await db.exec('RESET ROLE')
    // Use the installed production body, substituting only its clock for an
    // explicit DST instant; production SQL and admission logic stay identical.
    const definition = (await db.query<{ sql: string }>("SELECT pg_get_functiondef('public.reserve_akasha_withdrawal(uuid,uuid,numeric,numeric,text,text,jsonb,numeric)'::regprocedure) AS sql")).rows[0].sql
    try {
      await db.exec("SET TIME ZONE 'Europe/Paris'")
      await db.exec(definition.replaceAll('now()', "timestamptz '" + scenario.now + "'"))
      await db.exec("ALTER TABLE akasha_ai.withdrawal_requests ALTER COLUMN created_at SET DEFAULT timestamptz '" + scenario.now + "'")
      await db.query("INSERT INTO public.connect_withdrawals(user_id,stripe_account_id,amount_eur,metadata,created_at) VALUES ($1,'acct_synthetic',40,'{\"app\":\"akasha_ai\"}',$2)",
        [USER, scenario.receipt])
      await db.exec('SET ROLE service_role')
      const result = await reserve()
      if (scenario.allowed) expect(result.error).toBeNull()
      else expect(result.error?.message).toContain('withdrawal_daily_cap_exceeded')
    } finally {
      await db.exec('RESET ROLE')
      await db.exec(definition)
      await db.exec('ALTER TABLE akasha_ai.withdrawal_requests ALTER COLUMN created_at SET DEFAULT now()')
      await db.exec("SET TIME ZONE 'UTC'")
    }
  })
  it('unattributed shared history is refused instead of assumed absent', async () => {
    await db.exec('RESET ROLE')
    await db.query("INSERT INTO public.connect_withdrawals(user_id,stripe_account_id,amount_eur) VALUES ($1,'acct_synthetic',20)", [USER])
    await db.exec('SET ROLE service_role')
    expect((await reserve()).error?.message).toContain('withdrawal_history_ambiguous')
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
  })
  it('an unsubmitted old reservation restores once without using a previous day budget', async () => {
    await reserve(); await db.exec('RESET ROLE')
    await db.exec("UPDATE akasha_ai.withdrawal_requests SET created_at = now() - interval '2 days'")
    await db.exec('SET ROLE service_role')
    expect((await claim()).data).toMatchObject({ state: 'rejected', send_authorized: false, restored_balance_eur: 100 })
    expect((await claim()).data).toMatchObject({ state: 'rejected', send_authorized: false })
    const state = await snapshot(db)
    expect(state.requests[0].state).toBe('rejected')
    expect(state.balances[0].wallet_balance).toBe('100.00')
    expect(state.receipts).toHaveLength(1)
  })
  it('unprivileged roles cannot use financial RPCs; service role cannot mutate the journal directly', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('RESET ROLE; SET ROLE ' + role)
      expect((await reserve()).error?.message).toContain('permission denied')
    }
    await db.exec('RESET ROLE; SET ROLE service_role')
    await expect(db.exec('DELETE FROM akasha_ai.withdrawal_requests')).rejects.toThrow('permission denied')
    expect((await reserve()).error).toBeNull()
  })
  it.each([0, -20, 19.99, 'NaN', 'Infinity', 20.001])('rejects invalid money %s without mutation', async amount => {
    expect((await reserve({ p_amount_eur: amount, p_requested_amount_eur: amount })).error).not.toBeNull()
    expect((await snapshot(db)).requests).toHaveLength(0)
  })
  it('lookup cannot expose another owner’s receipt', async () => {
    await reserve()
    expect((await call('get_akasha_withdrawal', { p_user_id: OTHER, p_request_key: KEY })).data).toBeNull()
  })
  it('wrong attempt cannot mark reconciliation or refund', async () => {
    await reserve(); await claim()
    expect((await call('reconcile_akasha_withdrawal', { ...claimArgs, p_attempt_token: KEY })).error).not.toBeNull()
    expect((await call('reject_akasha_withdrawal', { ...claimArgs,
      p_attempt_token: ATTEMPT, p_failure_code: 'network_timeout' })).error).not.toBeNull()
  })
})
