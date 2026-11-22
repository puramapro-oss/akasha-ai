import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, databaseFixture, migration, rewardBoundaries, REQUEST_A, REQUEST_B, REQUEST_C, REQUEST_D,
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
    await db.exec(rewardBoundaries)
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
      await expect(share(db)).rejects.toMatchObject({ code: 'P0001' })
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

describe('accepted email sequence journal', () => {
  it('grants the service exactly the contact read/write access required by INSERT RETURNING', async () => {
    await db.exec('RESET ROLE; REVOKE ALL ON akasha_ai.contact_messages FROM PUBLIC, service_role')
    await db.exec(migration)
    await db.exec(rewardBoundaries)
    await db.exec('SET ROLE service_role')
    const result = await db.query(`INSERT INTO akasha_ai.contact_messages(name,email,subject,message)
      VALUES('Fixture','fixture@example.test','Receipt','Stored content') RETURNING name,email,subject,message`)
    expect(result.rows).toEqual([{ name: 'Fixture', email: 'fixture@example.test', subject: 'Receipt', message: 'Stored content' }])
    const forbidden = await db.query<{ allowed: boolean }>(
      "SELECT has_table_privilege(current_user,'akasha_ai.contact_messages','UPDATE,DELETE,TRUNCATE,TRIGGER') AS allowed")
    expect(forbidden.rows[0].allowed).toBe(false)
  })
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
  it.each(['RETURN NULL;', `NEW.user_id := '${USER_B}'; RETURN NEW;`, "NEW.email_type := 'tip_day1'; RETURN NEW;"])(
    'never acknowledges a suppressed or rewritten email receipt: %s', async body => {
      await db.exec('SET ROLE service_role')
      await withRewrite(db, 'email_sequences', 'INSERT', body, async () => {
        await expect(db.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [USER_A]))
          .rejects.toMatchObject({ code: 'P0001' })
        expect((await db.query('SELECT * FROM akasha_ai.email_sequences')).rows).toEqual([])
      })
      expect((await db.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome') AS inserted", [USER_A])).rows)
        .toEqual([{ inserted: true }])
    })
})
