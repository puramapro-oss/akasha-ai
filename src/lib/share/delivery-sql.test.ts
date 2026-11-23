import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyConsolidation, asUser, databaseFixture, incomingMigration, migration, rewardBoundaries, REQUEST_A, REQUEST_B, REQUEST_C, REQUEST_D,
  resetFixture, share, snapshot, storedRows, withRewrite, USER_A, USER_B } from './delivery-sql.test-support'

let db: PGlite
beforeAll(async () => { db = await databaseFixture() }, 15_000)
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
  it('replays the same UUID across the checked wrapper and canonical writer in either direction', async () => {
    const checked = async (id: string) => (await db.query<{ receipt: Record<string, unknown> }>(
      'SELECT akasha_ai.record_social_share_checked($1,$2,$3,$4) AS receipt',
      [id, 'ref-a', 'whatsapp', USER_A])).rows[0].receipt
    const first = await checked(REQUEST_A)
    expect(await share(db, REQUEST_A)).toEqual({ ...first, replayed: true })
    expect(await checked(REQUEST_A)).toEqual({ ...first, replayed: true })
    const second = await share(db, REQUEST_B)
    expect(await checked(REQUEST_B)).toEqual({ ...second, replayed: true })
    expect(await snapshot(db)).toEqual({ shares: 2, transactions: 2, ledger: 700, balance: 700, lifetime: 700 })
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
  it.each([
    ['social_shares', 'RETURN NULL;'], ['point_transactions', 'RETURN NULL;'], ['purama_points', 'RETURN NULL;'],
    ['social_shares', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['social_shares', 'NEW.points_given := 999; RETURN NEW;'],
    ['social_shares', `NEW.request_id := '${REQUEST_B}'; RETURN NEW;`],
    ['point_transactions', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['point_transactions', 'NEW.amount := 999; RETURN NEW;'],
    ['point_transactions', "NEW.source := 'other'; RETURN NEW;"],
    ['purama_points', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['purama_points', 'NEW.balance := 999; RETURN NEW;'],
    ['purama_points', 'NEW.lifetime_earned := 999; RETURN NEW;'],
  ])('rejects suppressed or rewritten share delivery in %s: %s', async (table, body) => {
    const tables = ['social_shares', 'point_transactions', 'purama_points']
    const before = await storedRows(db, tables)
    await withRewrite(db, table, 'INSERT', body, async () => {
      await expect(share(db)).rejects.toMatchObject({ code: '55000' })
      expect(await storedRows(db, tables)).toEqual(before)
    })
    expect((await share(db)).points).toBe(400)
  })
  it.each(['anon', 'authenticated', 'public_only'])('removes destructive/public ledger privileges for %s', async role => {
    await db.exec('SET ROLE ' + role)
    for (const table of ['social_shares', 'point_transactions', 'purama_points', 'email_sequences']) {
      const grants = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed", ['akasha_ai.' + table])
      expect(grants.rows[0].allowed).toBe(false)
      await expect(db.exec('TRUNCATE akasha_ai.' + table)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('returns actor-owned aggregates beyond an API page limit', async () => {
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given,shared_at)
      SELECT $1,'ref-a',300,now()-interval '2 days' FROM generate_series(1,1101)`, [USER_A])
    await db.query("INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given) VALUES($1,'ref-b',9000)", [USER_B])
    await asUser(db, USER_A); await share(db)
    expect((await db.query<{ receipt: unknown }>('SELECT akasha_ai.get_social_share_stats() AS receipt')).rows[0].receipt)
      .toEqual({ version: 1, user_id: USER_A, total_shares: 1102, points_earned: 330700, today_shares: 1 })
  })
})

describe('composed email writer boundary', () => {
  it('preserves the incoming minimal service contact grants after final composition', async () => {
    const incoming = await databaseFixture({ final: false, reuse: db })
    try {
      await resetFixture(incoming)
      await incoming.exec('RESET ROLE; REVOKE ALL ON akasha_ai.contact_messages FROM PUBLIC, service_role')
      await incoming.exec(incomingMigration)
      await incoming.exec(rewardBoundaries)
      await applyConsolidation(incoming)
      await incoming.exec('SET ROLE service_role')
      const result = await incoming.query(`INSERT INTO akasha_ai.contact_messages(name,email,subject,message)
        VALUES('Fixture','fixture@example.invalid','Receipt','Stored content') RETURNING name,email,subject,message`)
      expect(result.rows).toEqual([{ name: 'Fixture', email: 'fixture@example.invalid', subject: 'Receipt', message: 'Stored content' }])
      const forbidden = await incoming.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user,'akasha_ai.contact_messages','UPDATE,DELETE,TRUNCATE,TRIGGER') AS allowed")
      expect(forbidden.rows[0].allowed).toBe(false)
    } finally { await databaseFixture({ reuse: db }) }
  })
  it('retires the historical recorder even for service after consolidation', async () => {
    const query = "SELECT akasha_ai.record_email_sequence_delivery($1, 'welcome') AS inserted"
    await expect(db.query(query, [USER_A])).rejects.toThrow(/permission denied/)
    await db.exec('RESET ROLE; SET ROLE service_role')
    await expect(db.query(query, [USER_A])).rejects.toThrow(/permission denied/)
    expect((await db.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequences')).rows).toEqual([{ count: 0 }])
  })
  it('preserves historical logs without promoting them to a new provider confirmation', async () => {
    const incoming = await databaseFixture({ final: false, reuse: db })
    try {
      await resetFixture(incoming)
      await incoming.exec('RESET ROLE')
      await incoming.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome'),($1,'welcome')", [USER_A])
      const before = (await incoming.query('SELECT * FROM akasha_ai.email_sequences ORDER BY id')).rows
      await applyConsolidation(incoming)
      expect((await incoming.query('SELECT * FROM akasha_ai.email_sequences ORDER BY id')).rows).toEqual(before)
      expect((await incoming.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequence_deliveries')).rows).toEqual([{ count: 0 }])
      await asUser(incoming, USER_A)
      await expect(incoming.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome')", [USER_A]))
        .rejects.toThrow(/permission denied/)
    } finally { await databaseFixture({ reuse: db }) }
  })
})

describe('incoming request-id receipt compatibility', () => {
  it('replays the incoming RPC receipt and preserves all historical writes without a second credit', async () => {
    const incoming = await databaseFixture({ final: false, reuse: db })
    try {
      await resetFixture(incoming)
      const oldReceipt = await share(incoming)
      await incoming.exec('RESET ROLE')
      const before = await snapshot(incoming)
      await incoming.exec('RESET ROLE')
      const oldRows = (await incoming.query<Record<string, unknown>>('SELECT * FROM akasha_ai.social_shares')).rows
      await applyConsolidation(incoming)
      await asUser(incoming, USER_A)
      const receipt = await share(incoming)
      expect(receipt).toMatchObject({ ...oldReceipt, replayed: true })
      expect(receipt.transaction_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(await snapshot(incoming)).toEqual(before)
      const shares = (await incoming.query('SELECT * FROM akasha_ai.social_shares')).rows
      expect(shares).toEqual(oldRows.map(row => ({ ...row, tracking_transaction_id: null })))
    } finally { await databaseFixture({ reuse: db }) }
  })
  it.each(['missing ledger', 'ambiguous ledger', 'missing balance'])('protects incoming history with %s without crediting it again', async defect => {
    const incoming = await databaseFixture({ final: false, reuse: db })
    try {
      await resetFixture(incoming)
      await share(incoming)
      await incoming.exec('RESET ROLE')
      if (defect === 'missing ledger') await incoming.exec('DELETE FROM akasha_ai.point_transactions')
      else if (defect === 'ambiguous ledger') await incoming.exec(`INSERT INTO akasha_ai.point_transactions(user_id,amount,type,source)
        SELECT user_id,amount,type,source FROM akasha_ai.point_transactions`)
      else await incoming.exec('DELETE FROM akasha_ai.purama_points')
      await applyConsolidation(incoming)
      await asUser(incoming, USER_A)
      const before = await snapshot(incoming)
      await expect(share(incoming)).rejects.toMatchObject({ code: '55000' })
      expect(await snapshot(incoming)).toEqual(before)
    } finally { await databaseFixture({ reuse: db }) }
  })
  it.each(['RETURN NULL;', `NEW.user_id := '${USER_B}'; RETURN NEW;`, "NEW.email_type := 'tip_day1'; RETURN NEW;"])(
    'never acknowledges a suppressed or rewritten email receipt: %s', async body => {
      const incoming = await databaseFixture({ final: false, reuse: db })
      try {
      await resetFixture(incoming)
      await incoming.exec('RESET ROLE; SET ROLE service_role')
      await withRewrite(incoming, 'email_sequences', 'INSERT', body, async () => {
        await expect(incoming.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [USER_A]))
          .rejects.toMatchObject({ code: 'P0001' })
        expect((await incoming.query('SELECT * FROM akasha_ai.email_sequences')).rows).toEqual([])
      })
      expect((await incoming.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome') AS inserted", [USER_A])).rows)
        .toEqual([{ inserted: true }])
      await incoming.exec('RESET ROLE')
      await applyConsolidation(incoming)
      await incoming.exec('SET ROLE service_role')
      await expect(incoming.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [USER_A]))
        .rejects.toMatchObject({ code: '42501' })
      } finally { await databaseFixture({ reuse: db }) }
    })
})
