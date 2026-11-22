import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { cancelWithdrawal } from '../../src/lib/stripe/withdrawal-contract'
import { KEY, OTHER, SECOND_KEY, USER, bridge, claimArgs, database, identity, reserveArgs, reset, snapshot } from './fixture'

describe('Durable cancellation of a key before admission', () => {
  let db: PGlite
  beforeAll(async () => { db = await database() })
  beforeEach(async () => { await reset(db) })
  afterEach(async () => { await db.exec('RESET ROLE; DROP TRIGGER IF EXISTS cancel_trigger ON akasha_ai.withdrawal_cancellations') })
  afterAll(async () => { await db?.close() })
  const cancel = () => cancelWithdrawal(bridge(db), identity)
  const reserve = (key = KEY) => bridge(db).rpc('reserve_akasha_withdrawal', reserveArgs({ p_request_key: key }))
  const tombstones = async () => {
    await db.exec('RESET ROLE')
    const rows = (await db.query('SELECT * FROM akasha_ai.withdrawal_cancellations')).rows
    await db.exec('SET ROLE service_role'); return rows
  }

  it('cancellation winning admission prohibits a delayed old key forever and permits a new intention', async () => {
    const cancelled = await cancel()
    expect(cancelled).toMatchObject({ status: 200, body: { cancellation_confirmed: true,
      operation_state: 'cancelled', request_key: KEY, owner_id: USER } })
    expect((await reserve()).error?.message).toContain('withdrawal_request_cancelled')
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
    expect((await reserve(SECOND_KEY)).error).toBeNull()
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
    expect((await reserve()).error?.message).toContain('withdrawal_request_cancelled')
  })
  it('a lost cancellation acknowledgement is replayed with the same tombstone', async () => {
    const first = await cancel(); const second = await cancel()
    expect(second).toEqual(first); expect(await tombstones()).toHaveLength(1)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
  })
  it.each(['reserved', 'sending', 'reconciliation'])('admission winning cancellation keeps %s protected', async state => {
    await reserve()
    if (state !== 'reserved') await bridge(db).rpc('claim_akasha_withdrawal', claimArgs)
    if (state === 'reconciliation') await bridge(db).rpc('reconcile_akasha_withdrawal', claimArgs)
    const result = await cancel()
    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ operation_state: state, request_key: KEY })
    expect(result.body.cancellation_confirmed).toBeUndefined(); expect(await tombstones()).toHaveLength(0)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it('another owner cannot cancel or observe this owner’s operation', async () => {
    await reserve()
    const result = await cancelWithdrawal(bridge(db), { ...identity, userId: OTHER })
    expect(result.body.owner_id).toBe(OTHER)
    expect((await bridge(db).rpc('claim_akasha_withdrawal', claimArgs)).data).toMatchObject({ send_authorized: true })
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('80.00')
  })
  it.each(['BEFORE', 'AFTER'])('a %s trigger silently cancelling the tombstone rolls back confirmation', async timing => {
    await db.exec('RESET ROLE')
    const effect = timing === 'BEFORE' ? 'RETURN NULL;'
      : 'DELETE FROM akasha_ai.withdrawal_cancellations WHERE id=NEW.id; RETURN NEW;'
    await db.exec('CREATE OR REPLACE FUNCTION public.cancel_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN '
      + effect + ' END $$; CREATE TRIGGER cancel_trigger ' + timing
      + ' INSERT ON akasha_ai.withdrawal_cancellations FOR EACH ROW EXECUTE FUNCTION public.cancel_trigger_fn();')
    await db.exec('SET ROLE service_role')
    await expect(cancel()).rejects.toMatchObject({ code: 'withdrawal_outcome_unconfirmed' })
    expect(await tombstones()).toHaveLength(0)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('100.00')
  })
  it('anonymous callers and authenticated direct SQL cannot cancel; service cannot delete a tombstone', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('RESET ROLE; SET ROLE ' + role)
      expect((await bridge(db).rpc('cancel_akasha_withdrawal', {
        p_user_id: USER, p_request_key: KEY,
      })).error?.message).toContain('permission denied')
    }
    await db.exec('RESET ROLE; SET ROLE service_role'); await cancel()
    await expect(db.exec('DELETE FROM akasha_ai.withdrawal_cancellations')).rejects.toThrow('permission denied')
  })
})
