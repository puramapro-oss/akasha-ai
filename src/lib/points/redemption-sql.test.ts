import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { databaseFixture, resetFixture, storedRows, withRewrite, REQUEST_A, REQUEST_B, USER_A, USER_B } from '../share/delivery-sql.test-support'
import { SHOP_ITEMS } from './shop-catalog'

let db: PGlite
async function redeem(item = 'credits-10', cost: number | null = 2000, requestId = REQUEST_A, userId = USER_A) {
  const result = await db.query<{ receipt: Record<string, unknown> }>(
    'SELECT akasha_ai.redeem_points_reward($1,$2,$3,$4) AS receipt', [userId, cost, item, requestId])
  return result.rows[0].receipt
}
async function balances() {
  await db.exec('RESET ROLE')
  const result = await db.query(`SELECT
    (SELECT balance FROM akasha_ai.purama_points WHERE user_id='${USER_A}') AS balance,
    (SELECT credits FROM akasha_ai.profiles WHERE id='${USER_A}') AS credits,
    (SELECT count(*)::int FROM akasha_ai.point_transactions) AS journal,
    (SELECT count(*)::int FROM akasha_ai.point_purchases) AS purchases,
    (SELECT count(*)::int FROM akasha_ai.lottery_tickets) AS tickets`)
  await db.exec('SET ROLE service_role')
  return result.rows[0]
}
const unchanged = { balance: 10000, credits: 0, journal: 0, purchases: 0, tickets: 0 }
beforeAll(async () => { db = await databaseFixture() }, 15_000)
beforeEach(async () => {
  await resetFixture(db)
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,10000,10000)', [USER_A])
  await db.exec('SET ROLE service_role')
})
afterAll(async () => { await db?.close() })

describe('atomic delivery of existing shop rewards', () => {
  it('closes the legacy debit-only function to browsers and service clients', async () => {
    await expect(db.query("SELECT * FROM akasha_ai.redeem_points($1,1,'cash-1000')", [USER_A])).rejects.toThrow(/permission denied/)
    await db.exec('SET ROLE authenticated')
    await expect(redeem()).rejects.toThrow(/permission denied/)
    expect(await balances()).toEqual(unchanged)
  })
  it.each(SHOP_ITEMS)('delivers or safely refuses the unchanged catalogue item $id', async item => {
    if (item.id === 'ticket-1') await db.exec("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    const result = await redeem(item.id, item.cost_points)
    if (!item.available) {
      expect(result).toEqual({ success: false, reason: 'unavailable' })
      expect(await balances()).toEqual(unchanged)
      return
    }
    expect(result).toMatchObject({ success: true, fulfilled: true, item_id: item.id,
      cost_points: item.cost_points, request_id: REQUEST_A, new_balance: 10000 - item.cost_points })
    expect(await balances()).toEqual({ balance: 10000 - item.cost_points,
      credits: item.id === 'credits-10' ? 10 : item.id === 'credits-50' ? 50 : 0,
      journal: 1, purchases: 1, tickets: item.id === 'ticket-1' ? 1 : 0 })
  })
  it('replays a lost response without debiting or delivering twice', async () => {
    const first = await redeem()
    expect(await redeem()).toEqual({ ...first, replayed: true })
    expect(await balances()).toEqual({ balance: 8000, credits: 10, journal: 1, purchases: 1, tickets: 0 })
  })
  it('rejects reuse of an existing request for a different article', async () => {
    await redeem()
    await expect(redeem('credits-50', 8000)).rejects.toThrow(/different parameters/)
    expect(await balances()).toEqual({ balance: 8000, credits: 10, journal: 1, purchases: 1, tickets: 0 })
  })
  it.each([1, 0, -1, null, 2001])('checks the same server price for quote %j', async cost => {
    expect(await redeem('credits-10', cost)).toEqual({ success: false, reason: 'price_changed' })
    expect(await balances()).toEqual(unchanged)
  })
  it('refuses a ticket if no future draw is open, without a debit or purchase record', async () => {
    await db.exec("INSERT INTO akasha_ai.lottery_draws(draw_date,status) VALUES(now()-interval '1 day','upcoming'),(now()+interval '1 day','closed')")
    expect(await redeem('ticket-1', 500)).toEqual({ success: false, reason: 'no_draw' })
    expect(await balances()).toEqual(unchanged)
  })
  it('refuses insufficient funds without applying the reward', async () => {
    await redeem('credits-50', 8000)
    const before = await balances()
    expect(await redeem('credits-50', 8000, REQUEST_B)).toEqual({ success: false, reason: 'insufficient_points' })
    expect(await balances()).toEqual(before)
  })
  it('requires the authenticated owner when a user identity is carried by the service request', async () => {
    await expect(redeem('credits-10', 2000, REQUEST_A, USER_B)).rejects.toThrow(/invalid redemption owner/)
    expect(await balances()).toEqual(unchanged)
  })
  it.each(['point_transactions', 'point_purchases'])('rolls back debit and delivered credits if %s fails', async table => {
    await db.exec(`RESET ROLE; CREATE FUNCTION akasha_ai.synthetic_redemption_failure() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'synthetic downstream failure'; END $$;
      CREATE TRIGGER synthetic_redemption_failure BEFORE INSERT ON akasha_ai.${table}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_redemption_failure(); SET ROLE service_role;`)
    try {
      await expect(redeem()).rejects.toThrow(/synthetic downstream failure/)
      expect(await balances()).toEqual(unchanged)
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER synthetic_redemption_failure ON akasha_ai.${table};
        DROP FUNCTION akasha_ai.synthetic_redemption_failure(); SET ROLE service_role;`)
    }
  })
  it('rolls back a ticket and debit when its receipt cannot be stored', async () => {
    await db.exec("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    await db.exec(`RESET ROLE; CREATE FUNCTION akasha_ai.synthetic_redemption_failure() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$;
      CREATE TRIGGER synthetic_redemption_failure BEFORE INSERT ON akasha_ai.point_purchases
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_redemption_failure(); SET ROLE service_role;`)
    try {
      await expect(redeem('ticket-1', 500)).rejects.toThrow(/synthetic receipt failure/)
      expect(await balances()).toEqual(unchanged)
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER synthetic_redemption_failure ON akasha_ai.point_purchases;
        DROP FUNCTION akasha_ai.synthetic_redemption_failure(); SET ROLE service_role;`)
    }
  })
  it.each([
    ['purama_points', 'UPDATE', 'credits-10', 'RETURN NULL;'],
    ['purama_points', 'UPDATE', 'credits-10', 'NEW.balance := 999; RETURN NEW;'],
    ['purama_points', 'UPDATE', 'credits-10', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['profiles', 'UPDATE', 'credits-10', 'RETURN NULL;'],
    ['profiles', 'UPDATE', 'credits-50', 'NEW.credits := 999; RETURN NEW;'],
    ['point_transactions', 'INSERT', 'credits-10', 'RETURN NULL;'],
    ['point_transactions', 'INSERT', 'credits-10', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['point_transactions', 'INSERT', 'credits-10', 'NEW.amount := -1; RETURN NEW;'],
    ['point_purchases', 'INSERT', 'credits-10', 'RETURN NULL;'],
    ['point_purchases', 'INSERT', 'credits-10', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['point_purchases', 'INSERT', 'credits-10', 'NEW.points_spent := 1; RETURN NEW;'],
    ['point_purchases', 'INSERT', 'credits-50', 'NEW.fulfillment_value := 10; RETURN NEW;'],
    ['lottery_tickets', 'INSERT', 'ticket-1', 'RETURN NULL;'],
    ['lottery_tickets', 'INSERT', 'ticket-1', `NEW.user_id := '${USER_B}'; RETURN NEW;`],
    ['lottery_tickets', 'INSERT', 'ticket-1', "NEW.source := 'other'; RETURN NEW;"],
    ['point_purchases', 'INSERT', 'ticket-1', 'NEW.fulfillment_reference := NULL; RETURN NEW;'],
  ])('rolls back %s %s when %s is suppressed or rewritten: %s', async (table, operation, item, body) => {
    await db.exec("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    const price = SHOP_ITEMS.find(product => product.id === item)!.cost_points
    const tables = ['profiles', 'purama_points', 'point_transactions', 'point_purchases', 'lottery_tickets']
    const before = await storedRows(db, tables)
    await withRewrite(db, table, operation, body, async () => {
      await expect(redeem(item, price)).rejects.toMatchObject({ code: 'P0001' })
      expect(await storedRows(db, tables)).toEqual(before)
    })
    expect(await redeem(item, price)).toMatchObject({ success: true, fulfilled: true })
  })
  it.each(['anon', 'authenticated', 'public_only'])('removes all public receipt/ticket write privileges for %s', async role => {
    await db.exec('SET ROLE ' + role)
    for (const table of ['point_purchases', 'lottery_tickets']) {
      const grants = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed", ['akasha_ai.' + table])
      expect(grants.rows[0].allowed).toBe(false)
      await expect(db.exec('TRUNCATE akasha_ai.' + table)).rejects.toMatchObject({ code: '42501' })
    }
  })
})
