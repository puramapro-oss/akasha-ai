import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, databaseFixture, migration, REQUEST_A, REQUEST_B, REQUEST_C, REQUEST_D,
  resetFixture, share, snapshot, USER_A, USER_B } from './delivery-sql.test-support'

let db: PGlite
beforeAll(async () => { db = await databaseFixture() })
beforeEach(async () => resetFixture(db))
afterAll(async () => { await db?.close() })

describe('real in-process PostgreSQL transaction for share rewards', () => {
  it('commits the share, ledger and balance together', async () => {
    expect(await share(db)).toMatchObject({ user_id: USER_A, request_id: REQUEST_A, points: 400,
      today_shares: 1, replayed: false })
    expect(await snapshot(db)).toEqual({ shares: 1, transactions: 1, ledger: 400, balance: 400, lifetime: 400 })
  })
  it('replays one request without creating or crediting a second event', async () => {
    const first = await share(db)
    expect(await share(db)).toEqual({ ...first, replayed: true })
    expect(await snapshot(db)).toEqual({ shares: 1, transactions: 1, ledger: 400, balance: 400, lifetime: 400 })
  })
  it('rejects a replay with different parameters without changing any balance', async () => {
    await share(db)
    await expect(share(db, REQUEST_A, 'ref-a', 'telegram')).rejects.toThrow(/different parameters/)
    expect(await snapshot(db)).toMatchObject({ shares: 1, ledger: 400, balance: 400 })
  })
  it('enforces the existing 400/300/300 reward and three-per-day cap in PostgreSQL', async () => {
    expect((await share(db, REQUEST_A)).points).toBe(400)
    expect((await share(db, REQUEST_B)).points).toBe(300)
    expect((await share(db, REQUEST_C)).points).toBe(300)
    await expect(share(db, REQUEST_D)).rejects.toThrow(/maximum 3/)
    expect(await snapshot(db)).toEqual({ shares: 3, transactions: 3, ledger: 1000, balance: 1000, lifetime: 1000 })
  })
  it('keeps replay idempotency after the UTC day changes', async () => {
    await share(db)
    await db.exec("RESET ROLE; UPDATE akasha_ai.social_shares SET shared_at = now() - interval '2 days'; SET ROLE authenticated")
    expect(await share(db)).toMatchObject({ replayed: true, today_shares: 0, points: 400 })
    expect(await snapshot(db)).toMatchObject({ shares: 1, ledger: 400, balance: 400 })
  })
  it('supports repeat requests from two independent authenticated users', async () => {
    await share(db)
    await asUser(db, USER_B)
    expect(await share(db, REQUEST_A, 'ref-b')).toMatchObject({ user_id: USER_B, points: 400, replayed: false })
    expect(await snapshot(db)).toMatchObject({ shares: 2, ledger: 800, balance: 800 })
  })
  it.each([['ref-b', 'whatsapp'], ['ref-a', 'unknown'], ['', 'whatsapp']])('rejects malformed/foreign share parameters %s %s', async (code, platform) => {
    await expect(share(db, REQUEST_A, code, platform)).rejects.toThrow()
    expect(await snapshot(db)).toMatchObject({ shares: 0, transactions: 0, balance: 0 })
  })
  it('rejects a missing idempotency key', async () => {
    await expect(share(db, null)).rejects.toThrow(/invalid share/)
    expect(await snapshot(db)).toMatchObject({ shares: 0, balance: 0 })
  })
  it('cannot credit a share without an authenticated identity', async () => {
    await asUser(db, '')
    await expect(share(db)).rejects.toThrow(/authentication required/)
  })
  it.each(['social_shares', 'point_transactions', 'purama_points'])('blocks direct authenticated writes to %s even with a legacy permissive policy', async table => {
    const query = table === 'social_shares'
      ? "INSERT INTO akasha_ai.social_shares(user_id, share_code, points_given) VALUES($1, 'ref-a', 999999)"
      : table === 'point_transactions'
        ? "INSERT INTO akasha_ai.point_transactions(user_id, amount, type) VALUES($1, 999999, 'partage')"
        : 'INSERT INTO akasha_ai.purama_points(user_id, balance) VALUES($1, 999999)'
    await expect(db.query(query, [USER_A])).rejects.toThrow(/permission denied/)
  })
  it.each(['point_transactions', 'purama_points'])('rolls back every write when %s fails after the share insertion', async table => {
    await db.exec(`RESET ROLE;
      CREATE FUNCTION akasha_ai.synthetic_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'synthetic downstream failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON akasha_ai.${table}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_delivery_failure(); SET ROLE authenticated;`)
    try {
      await expect(share(db)).rejects.toThrow(/synthetic downstream failure/)
      expect(await snapshot(db)).toEqual({ shares: 0, transactions: 0, ledger: 0, balance: 0, lifetime: 0 })
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER synthetic_failure ON akasha_ai.${table};
        DROP FUNCTION akasha_ai.synthetic_delivery_failure(); SET ROLE authenticated;`)
    }
    expect((await share(db)).points).toBe(400)
  })
  it('reapplies the migration without deleting historical rows or modifying balances', async () => {
    await share(db)
    const before = await snapshot(db)
    await db.exec('RESET ROLE')
    await db.exec(migration)
    expect(await snapshot(db)).toEqual(before)
  })
})

describe('accepted email sequence journal', () => {
  it('requires service role and writes one record for repeated confirmations', async () => {
    const query = "SELECT akasha_ai.record_email_sequence_delivery($1, 'welcome') AS inserted"
    await expect(db.query(query, [USER_A])).rejects.toThrow(/permission denied/)
    await db.exec('RESET ROLE; SET ROLE service_role')
    expect((await db.query(query, [USER_A])).rows).toEqual([{ inserted: true }])
    expect((await db.query(query, [USER_A])).rows).toEqual([{ inserted: false }])
    expect((await db.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequences')).rows).toEqual([{ count: 1 }])
  })
  it('preserves a historical duplicate pair and never adds a third record', async () => {
    await db.exec('RESET ROLE')
    await db.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome'),($1,'welcome')", [USER_A])
    await db.exec('SET ROLE service_role')
    const result = await db.query("SELECT akasha_ai.record_email_sequence_delivery($1, 'welcome') AS inserted", [USER_A])
    expect(result.rows).toEqual([{ inserted: false }])
    expect((await db.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequences')).rows).toEqual([{ count: 2 }])
  })
  it('blocks client-side insertion of fake delivery confirmations', async () => {
    await expect(db.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome')", [USER_A]))
      .rejects.toThrow(/permission denied/)
  })
})
