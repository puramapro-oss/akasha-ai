import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { bridge, claimArgs, completeArgs, database, reserveArgs, reset, snapshot } from './fixture'

describe('Withdrawal mutations require confirmed SQL rows', () => {
  let db: PGlite
  beforeAll(async () => { db = await database() })
  beforeEach(async () => {
    await db.exec('RESET ROLE; DROP TRIGGER IF EXISTS withdrawal_fault ON akasha_ai.profiles;'
      + 'DROP TRIGGER IF EXISTS withdrawal_fault ON akasha_ai.withdrawal_requests;'
      + 'DROP TRIGGER IF EXISTS withdrawal_fault ON public.connect_withdrawals;')
    await reset(db)
  })
  afterAll(async () => { await db?.close() })
  const call = (name: string, args: Record<string, unknown>) => bridge(db).rpc(name, args)
  async function inject(table: string, event: string, body: string, timing = 'BEFORE') {
    await db.exec('RESET ROLE')
    await db.exec('CREATE OR REPLACE FUNCTION public.withdrawal_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN '
      + body + ' END $$; CREATE TRIGGER withdrawal_fault ' + timing + ' ' + event + ' ON ' + table
      + ' FOR EACH ROW EXECUTE FUNCTION public.withdrawal_fault();')
    await db.exec('SET ROLE service_role')
  }
  async function sending() {
    await call('reserve_akasha_withdrawal', reserveArgs())
    await call('claim_akasha_withdrawal', claimArgs)
  }

  it.each([
    ['akasha_ai.profiles', 'UPDATE', 'RETURN NULL;'],
    ['akasha_ai.profiles', 'UPDATE', 'NEW.wallet_balance := OLD.wallet_balance; RETURN NEW;'],
    ['akasha_ai.withdrawal_requests', 'INSERT', 'RETURN NULL;'],
    ['akasha_ai.withdrawal_requests', 'INSERT', "NEW.stripe_account_id := 'acct_changed'; RETURN NEW;"],
  ])('rollback admission after suppressed/rewritten row in %s %s', async (table, event, body) => {
    await inject(table, event, body)
    expect((await call('reserve_akasha_withdrawal', reserveArgs())).error).not.toBeNull()
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('100.00'); expect(state.requests).toHaveLength(0)
  })
  it('a suppressed claim is an error and authorizes no provider call', async () => {
    await call('reserve_akasha_withdrawal', reserveArgs())
    await inject('akasha_ai.withdrawal_requests', 'UPDATE', 'RETURN NULL;')
    expect((await call('claim_akasha_withdrawal', claimArgs)).error).not.toBeNull()
    expect((await snapshot(db)).requests[0].state).toBe('reserved')
  })
  it.each(['RETURN NULL;', 'NEW.amount_eur := NEW.amount_eur + 1; RETURN NEW;'])(
    'a suppressed/rewritten shared receipt prevents completion: %s', async body => {
      await sending(); await inject('public.connect_withdrawals', 'INSERT', body)
      expect((await call('complete_akasha_withdrawal', completeArgs)).error).not.toBeNull()
      const state = await snapshot(db)
      expect(state.requests[0].state).toBe('sending'); expect(state.receipts).toHaveLength(0)
    })
  it('a suppressed terminal journal update rolls back the shared receipt', async () => {
    await sending(); await inject('akasha_ai.withdrawal_requests', 'UPDATE', 'RETURN NULL;')
    expect((await call('complete_akasha_withdrawal', completeArgs)).error).not.toBeNull()
    expect((await snapshot(db)).receipts).toHaveLength(0)
  })
  it('a suppressed balance restoration rolls back rejection and its receipt', async () => {
    await sending(); await inject('akasha_ai.profiles', 'UPDATE', 'RETURN NULL;')
    expect((await call('reject_akasha_withdrawal', { ...claimArgs,
      p_failure_code: 'balance_insufficient' })).error).not.toBeNull()
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00')
    expect(state.requests[0].state).toBe('sending'); expect(state.receipts).toHaveLength(0)
  })
  it('a suppressed reconciliation update is not acknowledged', async () => {
    await sending(); await inject('akasha_ai.withdrawal_requests', 'UPDATE', 'RETURN NULL;')
    expect((await call('reconcile_akasha_withdrawal', claimArgs)).error).not.toBeNull()
  })
  it('an AFTER trigger cannot undo the debit after RETURNING', async () => {
    await inject('akasha_ai.profiles', 'UPDATE',
      'IF NEW.wallet_balance = 80 THEN UPDATE akasha_ai.profiles SET wallet_balance = 100 WHERE id = NEW.id; END IF; RETURN NULL;', 'AFTER')
    expect((await call('reserve_akasha_withdrawal', reserveArgs())).error).not.toBeNull()
    const state = await snapshot(db)
    expect(state.requests).toHaveLength(0); expect(state.balances[0].wallet_balance).toBe('100.00')
  })
  it('an AFTER trigger cannot change the persisted request destination', async () => {
    await inject('akasha_ai.withdrawal_requests', 'INSERT',
      "UPDATE akasha_ai.withdrawal_requests SET stripe_account_id = 'acct_changed' WHERE id = NEW.id; RETURN NULL;", 'AFTER')
    expect((await call('reserve_akasha_withdrawal', reserveArgs())).error).not.toBeNull()
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
  })
  it('an AFTER trigger cannot rewrite the shared receipt after confirmation', async () => {
    await sending()
    await inject('public.connect_withdrawals', 'INSERT',
      'UPDATE public.connect_withdrawals SET amount_eur = amount_eur + 1 WHERE id = NEW.id; RETURN NULL;', 'AFTER')
    expect((await call('complete_akasha_withdrawal', completeArgs)).error).not.toBeNull()
    const state = await snapshot(db)
    expect(state.requests[0].state).toBe('sending'); expect(state.receipts).toHaveLength(0)
  })
  it('an AFTER trigger cannot undo a confirmed restoration', async () => {
    await sending()
    await inject('akasha_ai.profiles', 'UPDATE',
      'IF NEW.wallet_balance = 100 THEN UPDATE akasha_ai.profiles SET wallet_balance = 80 WHERE id = NEW.id; END IF; RETURN NULL;', 'AFTER')
    expect((await call('reject_akasha_withdrawal', { ...claimArgs,
      p_failure_code: 'balance_insufficient' })).error).not.toBeNull()
    const state = await snapshot(db)
    expect(state.requests[0].state).toBe('sending'); expect(state.receipts).toHaveLength(0)
    expect(state.balances[0].wallet_balance).toBe('80.00')
  })
  it('an AFTER trigger cannot silently change the terminal journal', async () => {
    await sending()
    await inject('akasha_ai.withdrawal_requests', 'UPDATE',
      "IF NEW.state = 'completed' AND NEW.failure_code IS NULL THEN UPDATE akasha_ai.withdrawal_requests SET failure_code = 'changed' WHERE id = NEW.id; END IF; RETURN NULL;", 'AFTER')
    expect((await call('complete_akasha_withdrawal', completeArgs)).error).not.toBeNull()
    expect((await snapshot(db)).receipts).toHaveLength(0)
  })
})
