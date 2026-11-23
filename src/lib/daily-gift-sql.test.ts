import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, resetFixture, asUser, share, storedRows, withRewrite, USER_A, USER_B } from './share/delivery-sql.test-support'

const migration = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261122165100_daily_gift_delivery.sql', import.meta.url)), 'utf8')
const profileBoundary = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261122165300_profile_write_boundary.sql', import.meta.url)), 'utf8')
let db: PGlite
beforeAll(async () => {
  db = await databaseFixture()
}, 15_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await resetFixture(db); await db.exec('RESET ROLE; TRUNCATE akasha_ai.lottery_draws CASCADE; SET ROLE service_role;') })
async function claim(type = 'points', amount = 7, user = USER_A, streak = 0) {
  const result = await db.query<{ receipt: { gift: { id: string; gift_type: string; fulfilled_at: string | null }; replayed: boolean } }>(
    'SELECT akasha_ai.claim_daily_gift($1, $2, $3, $4) AS receipt', [user, type, amount, streak])
  return result.rows[0].receipt
}
async function counts() {
  await db.exec('RESET ROLE')
  const result = await db.query('SELECT (SELECT count(*)::integer FROM akasha_ai.daily_gifts) gifts,' +
    '(SELECT count(*)::integer FROM akasha_ai.point_transactions) transactions,' +
    '(SELECT coalesce(sum(balance),0)::integer FROM akasha_ai.purama_points) balance,' +
    '(SELECT count(*)::integer FROM akasha_ai.user_coupons) coupons,' +
    '(SELECT count(*)::integer FROM akasha_ai.lottery_tickets) tickets')
  await db.exec('SET ROLE service_role')
  return result.rows[0]
}

describe('daily gift rewards execute in the database transaction', () => {
  it('commits the point claim, ledger and balance once and replays its actual reward', async () => {
    const first = await claim()
    const replay = await claim('credits', 3)
    expect(first.gift.fulfilled_at).toBeTruthy()
    expect(replay).toEqual({ gift: first.gift, replayed: true })
    expect(await counts()).toEqual({ gifts: 1, transactions: 1, balance: 7, coupons: 0, tickets: 0 })
  })
  it('rolls back the claim on a ledger failure and allows a safe retry', async () => {
    await db.exec("RESET ROLE; CREATE FUNCTION akasha_ai.gift_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic ledger failure'; END $$;" +
      'CREATE TRIGGER gift_test_fail BEFORE INSERT ON akasha_ai.point_transactions FOR EACH ROW EXECUTE FUNCTION akasha_ai.gift_test_fail(); SET ROLE service_role;')
    await expect(claim()).rejects.toThrow('synthetic ledger failure')
    expect(await counts()).toMatchObject({ gifts: 0, transactions: 0, balance: 0 })
    await db.exec('RESET ROLE; DROP TRIGGER gift_test_fail ON akasha_ai.point_transactions; DROP FUNCTION akasha_ai.gift_test_fail(); SET ROLE service_role;')
    await claim()
    expect(await counts()).toMatchObject({ gifts: 1, transactions: 1, balance: 7 })
  })
  it('adds credits and records a pending coupon without spending its validity before activation', async () => {
    await claim('credits', 3)
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE service_role;")
    const pending = await claim('coupon', 20, USER_B)
    expect(pending.gift.fulfilled_at).toBeNull()
    expect((await claim('coupon', 20, USER_B)).gift).toEqual(pending.gift)
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [USER_A])).rows[0]).toEqual({ credits: 3 })
    expect((await db.query('SELECT discount_percent, expires_at FROM akasha_ai.user_coupons')).rows[0]).toEqual({ discount_percent: 20, expires_at: null })
    expect((await db.query('SELECT delivery_status, delivery_details FROM akasha_ai.daily_gifts WHERE user_id=$1', [USER_B])).rows[0])
      .toMatchObject({ delivery_status: 'pending_coupon_activation', delivery_details: { valid_for_days: 3 } })
  })
  it.each([[5, 0, 7], [10, 7, 7], [50, 7, 1]])('keeps coupon %s at streak %s pending with %s future validity days', async (amount, streak, days) => {
    await db.query('UPDATE akasha_ai.streaks SET current_streak=$2 WHERE user_id=$1', [USER_A, streak])
    const result = await claim('coupon', amount, USER_A, streak)
    expect(result.gift).toMatchObject({ fulfilled_at: null, delivery_status: 'pending_coupon_activation',
      delivery_details: { discount_percent: amount, expires_at: null, valid_for_days: days } })
    expect((await db.query('SELECT discount_percent,expires_at,used FROM akasha_ai.user_coupons')).rows)
      .toEqual([{ discount_percent: amount, expires_at: null, used: false }])
  })
  it('rejects a sub-ten coupon when the authoritative seven-day streak guarantees at least ten', async () => {
    await db.query('UPDATE akasha_ai.streaks SET current_streak=7 WHERE user_id=$1', [USER_A])
    await expect(claim('coupon', 5, USER_A, 7)).rejects.toMatchObject({ code: '22023' })
    expect(await counts()).toMatchObject({ gifts: 0, coupons: 0 })
  })
  it('does not consume a ticket claim without an upcoming draw', async () => {
    await expect(claim('ticket', 1)).rejects.toThrow('no eligible lottery draw')
    expect(await counts()).toMatchObject({ gifts: 0, tickets: 0 })
    await db.exec("RESET ROLE; INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now() + interval '1 day'); SET ROLE service_role;")
    await claim('ticket', 1)
    await claim('ticket', 1)
    expect(await counts()).toMatchObject({ gifts: 1, tickets: 1 })
  })
  it('preserves an ambiguous historical claim and refuses to recredit it', async () => {
    await db.query("INSERT INTO akasha_ai.daily_gifts(user_id,gift_type,gift_value) VALUES($1,'points','7')", [USER_A])
    await expect(claim()).rejects.toThrow('historical gift requires reconciliation')
    expect(await counts()).toMatchObject({ gifts: 1, transactions: 0, balance: 0 })
  })
  it('refuses direct authenticated reward writes and a foreign owner', async () => {
    await asUser(db, USER_A)
    await expect(claim()).rejects.toThrow('permission denied')
    for (const statement of [
      "INSERT INTO akasha_ai.daily_gifts(user_id,gift_type,gift_value) VALUES($1,'points','7')",
      "INSERT INTO akasha_ai.user_coupons(user_id,code,discount_percent) VALUES($1,'fake',100)",
      "INSERT INTO akasha_ai.lottery_tickets(user_id,source) VALUES($1,'fake')",
    ]) await expect(db.query(statement, [USER_A])).rejects.toThrow('permission denied')
    await db.exec('SET ROLE service_role')
    await expect(claim('points', 7, USER_B)).rejects.toThrow('invalid gift owner')
  })
  it('preserves a share credit when the daily gift follows it', async () => {
    await asUser(db, USER_A); await share(db); await db.exec('SET ROLE service_role')
    await claim()
    expect(await counts()).toMatchObject({ gifts: 1, transactions: 2, balance: 407 })
  })
  it.each([['points', 10000, 0], ['coupon', 50, 0], ['credits', -3, 0], ['ticket', 2, 0]])(
    'refuses an invalid outcome without a claim: %s %s', async (type, amount, streak) => {
      await expect(claim(String(type), Number(amount), USER_A, Number(streak))).rejects.toThrow('invalid gift outcome')
      expect(await counts()).toMatchObject({ gifts: 0, transactions: 0, balance: 0 })
    })
  it('rejects a changed streak before granting the draw result', async () => {
    await expect(claim('points', 7, USER_A, 7)).rejects.toThrow('streak changed')
    expect(await counts()).toMatchObject({ gifts: 0 })
  })
  it('reapplies without modifying historical or confirmed rows', async () => {
    const first = await claim()
    await db.exec('RESET ROLE'); await db.exec(migration); await db.exec('SET ROLE service_role')
    expect((await claim()).gift).toEqual(first.gift)
    expect(await counts()).toMatchObject({ gifts: 1, transactions: 1, balance: 7 })
  })
  it('preserves ordinary profile and onboarding edits while restricting account-owned values', async () => {
    await asUser(db, USER_A)
    const update = await db.query("UPDATE akasha_ai.profiles SET display_name='Fixture', accent_color='cyan', onboarding_completed=true, updated_at=now() WHERE id=$1 RETURNING display_name", [USER_A])
    expect(update.rows).toEqual([{ display_name: 'Fixture' }])
    for (const column of ['credits', 'wallet_balance', 'xp', 'level', 'role', 'plan']) {
      const value = ['role', 'plan'].includes(column) ? "'fixture'" : '1'
      await expect(db.exec('UPDATE akasha_ai.profiles SET ' + column + '=' + value)).rejects.toThrow('permission denied')
    }
    expect((await db.query("UPDATE akasha_ai.profiles SET display_name='Other' WHERE id=$1 RETURNING id", [USER_B])).rows).toEqual([])
    await expect(db.exec('DELETE FROM akasha_ai.profiles')).rejects.toThrow('permission denied')
  })
  it('preserves server reward updates after profile permission changes', async () => {
    await claim('credits', 3)
    expect((await db.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [USER_A])).rows).toEqual([{ credits: 3 }])
    await db.exec('RESET ROLE'); await db.exec(profileBoundary)
    expect((await db.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [USER_A])).rows).toEqual([{ credits: 3 }])
  })
  it.each([
    ['daily_gifts', 'INSERT', 'points', 'RETURN NULL;'],
    ['daily_gifts', 'UPDATE', 'points', 'RETURN NULL;'],
    ['daily_gifts', 'UPDATE', 'coupon', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['daily_gifts', 'UPDATE', 'coupon', "NEW.delivery_status := 'delivered'; RETURN NEW;"],
    ['point_transactions', 'INSERT', 'points', 'RETURN NULL;'],
    ['point_transactions', 'INSERT', 'points', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['point_transactions', 'INSERT', 'points', 'NEW.amount := 999; RETURN NEW;'],
    ['purama_points', 'INSERT', 'points', 'RETURN NULL;'],
    ['purama_points', 'INSERT', 'points', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['purama_points', 'UPDATE', 'points', 'NEW.balance := 999; RETURN NEW;'],
    ['purama_points', 'UPDATE', 'points', 'NEW.lifetime_earned := 999; RETURN NEW;'],
    ['profiles', 'UPDATE', 'credits', 'RETURN NULL;'],
    ['profiles', 'UPDATE', 'credits', 'NEW.credits := 999; RETURN NEW;'],
    ['user_coupons', 'INSERT', 'coupon', 'RETURN NULL;'],
    ['user_coupons', 'INSERT', 'coupon', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['user_coupons', 'INSERT', 'coupon', 'NEW.discount_percent := 50; RETURN NEW;'],
    ['user_coupons', 'INSERT', 'coupon', 'NEW.expires_at := now(); RETURN NEW;'],
    ['lottery_tickets', 'INSERT', 'ticket', 'RETURN NULL;'],
    ['lottery_tickets', 'INSERT', 'ticket', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['lottery_tickets', 'INSERT', 'ticket', "NEW.source := 'other'; RETURN NEW;"],
  ])('rolls back suppressed/rewritten %s %s for %s: %s', async (table, operation, kind, body) => {
    const amounts: Record<string, number> = { points: 7, credits: 3, coupon: 20, ticket: 1 }
    await db.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,400,700)', [USER_A])
    await db.exec("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    const tables = ['profiles', 'daily_gifts', 'point_transactions', 'purama_points', 'user_coupons', 'lottery_tickets']
    const before = await storedRows(db, tables)
    await withRewrite(db, table, operation, body, async () => {
      await expect(claim(kind, amounts[kind])).rejects.toMatchObject({ code: 'P0001' })
      expect(await storedRows(db, tables)).toEqual(before)
    })
    expect((await claim(kind, amounts[kind])).gift.id).toEqual(expect.any(String))
  })
  it.each(['anon', 'authenticated', 'public_only'])('removes destructive/public gift and profile privileges for %s', async role => {
    await db.exec('SET ROLE ' + role)
    for (const table of ['daily_gifts', 'user_coupons', 'lottery_tickets', 'profiles']) {
      const grants = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user,$1,'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed", ['akasha_ai.' + table])
      expect(grants.rows[0].allowed).toBe(false)
      await expect(db.exec('TRUNCATE akasha_ai.' + table + ' CASCADE')).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('preserves all twelve existing editable profile columns and removes old protected column grants', async () => {
    await db.exec('RESET ROLE; GRANT UPDATE(role,credits), INSERT(id,role), REFERENCES(role) ON akasha_ai.profiles TO PUBLIC,anon,authenticated')
    await db.exec(profileBoundary)
    const columns = await db.query<{ column: string; editable: boolean; insertable: boolean; referenceable: boolean }>(`
      SELECT attname AS column, has_column_privilege('authenticated',attrelid,attnum,'UPDATE') AS editable,
        has_column_privilege('authenticated',attrelid,attnum,'INSERT') AS insertable,
        has_column_privilege('authenticated',attrelid,attnum,'REFERENCES') AS referenceable
      FROM pg_attribute WHERE attrelid='akasha_ai.profiles'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname`)
    expect(columns.rows.filter(column => column.editable).map(column => column.column)).toEqual([
      'accent_color', 'avatar_url', 'bio', 'display_name', 'interests', 'onboarding_completed',
      'onboarding_level', 'onboarding_use_case', 'preferred_language', 'pseudo', 'tutorial_completed', 'updated_at',
    ])
    expect(columns.rows.some(column => column.insertable || column.referenceable)).toBe(false)
  })
})
