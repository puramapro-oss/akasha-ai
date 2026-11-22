import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { A, B, actor, database, migration, operationId, reset, snapshot, track } from './sql-fixture'

let db: PGlite
beforeAll(async () => { db = await database() }, 15000)
beforeEach(async () => reset(db))
afterAll(async () => db?.close())

it('records the share, ledger and spendable balance once and returns their linked receipt', async () => {
  const proof = await track(db)
  expect(proof).toMatchObject({ replayed: false, user_id: A, request_id: operationId(1), points: 400,
    share_code: 'ref-a', platform_id: 'native' })
  const state = await snapshot(db)
  expect(state.shares).toHaveLength(1)
  expect(state.points).toHaveLength(1)
  expect(state.accounts).toMatchObject([{ user_id: A, balance: 400, lifetime_earned: 400 }])
  expect(state.shares[0]).toMatchObject({ id: proof.share_id, tracking_transaction_id: proof.transaction_id })
  expect(state.points[0]).toMatchObject({ id: proof.transaction_id, type: 'partage', amount: 400 })
})

it('returns an identical replay after the daily quota has already been reached', async () => {
  const first = await track(db, 1)
  expect((await track(db, 2)).points).toBe(300)
  expect((await track(db, 3)).points).toBe(300)
  const before = await snapshot(db)
  expect(await track(db, 1)).toEqual({ ...first, replayed: true, today_shares: 3 })
  await expect(track(db, 4)).rejects.toMatchObject({ code: 'P0001', message: 'maximum 3 shares per UTC day' })
  expect(await snapshot(db)).toEqual(before)
})

it('does not reuse an operation for another platform or referral code', async () => {
  await track(db)
  const before = await snapshot(db)
  for (const changes of [{ platform: 'telegram' }, { code: 'changed-code' }]) {
    await expect(track(db, 1, changes)).rejects.toMatchObject({ code: '22023', message: expect.stringContaining('share_operation_conflict') })
  }
  expect(await snapshot(db)).toEqual(before)
})

it('binds the actor to auth.uid and never trusts a caller-selected beneficiary', async () => {
  await expect(track(db, 1, { code: 'ref-b' })).rejects.toMatchObject({ code: '42501' })
  await actor(db, null)
  await expect(track(db)).rejects.toMatchObject({ code: '42501' })
  expect(await snapshot(db)).toEqual({ shares: [], points: [], accounts: [] })
})

it('keeps equal operation ids independent across two authenticated actors', async () => {
  await track(db)
  await actor(db, B)
  expect(await track(db, 1, { code: 'ref-b' })).toMatchObject({ replayed: false, user_id: B, points: 400 })
  expect((await snapshot(db)).points).toHaveLength(2)
})

it.each([{ operation: null }, { platform: 'invented' }, { platform: null }, { code: '' }])(
  'rejects invalid inputs before changing any of the three effects: %j', async changes => {
    await expect(track(db, 1, changes)).rejects.toMatchObject({ code: '22023' })
    expect(await snapshot(db)).toEqual({ shares: [], points: [], accounts: [] })
  })

for (const [target, body] of [
  ['point_transactions', "RAISE EXCEPTION 'synthetic transaction failure';"],
  ['social_shares', "RAISE EXCEPTION 'synthetic late receipt failure';"],
  ['point_transactions', 'NEW.amount := 999; RETURN NEW;'],
  ['point_transactions', 'RETURN NULL;'],
  ['social_shares', 'RETURN NULL;'],
  ['purama_points', 'RETURN NULL;'],
  ['purama_points', 'NEW.balance := 999; RETURN NEW;'],
  ['social_shares', "NEW.user_id := '00000000-0000-4000-8000-000000000002'; RETURN NEW;"],
] as const) {
  it('rolls back all three effects after ' + target + ': ' + body, async () => {
    await db.exec(`RESET ROLE; CREATE FUNCTION akasha_ai.synthetic_share_failure() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN ${body} END $$;
      CREATE TRIGGER synthetic_share_failure BEFORE INSERT ON akasha_ai.${target}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_share_failure(); SET ROLE authenticated;`)
    try {
      await expect(track(db)).rejects.toBeDefined()
      expect(await snapshot(db)).toEqual({ shares: [], points: [], accounts: [] })
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER synthetic_share_failure ON akasha_ai.${target};
        DROP FUNCTION akasha_ai.synthetic_share_failure(); SET ROLE authenticated;`)
    }
  })
}

for (const [name, target, body] of [
  ['share removed after insertion', 'social_shares',
    'DELETE FROM akasha_ai.social_shares WHERE id = NEW.id; RETURN NEW;'],
  ['points rewritten after the share insertion', 'social_shares',
    'UPDATE akasha_ai.point_transactions SET amount = 999 WHERE id = NEW.tracking_transaction_id; RETURN NEW;'],
  ['balance removed after insertion', 'purama_points',
    'DELETE FROM akasha_ai.purama_points WHERE id = NEW.id; RETURN NEW;'],
  ['balance rewritten after insertion', 'purama_points',
    'UPDATE akasha_ai.purama_points SET balance = 999 WHERE id = NEW.id; RETURN NEW;'],
  ['balance trigger rewrites a prior ledger', 'purama_points',
    "UPDATE akasha_ai.point_transactions SET amount = 999 WHERE user_id = NEW.user_id AND type = 'partage'; RETURN NEW;"],
  ['balance trigger removes the share receipt', 'purama_points',
    'DELETE FROM akasha_ai.social_shares WHERE user_id = NEW.user_id; RETURN NEW;'],
  ['point beneficiary rewritten after insertion', 'point_transactions',
    `UPDATE akasha_ai.point_transactions SET user_id = '${B}' WHERE id = NEW.id; RETURN NEW;`],
] as const) {
  it('confirms the final state of all three effects and rolls back: ' + name, async () => {
    await db.exec(`RESET ROLE; CREATE FUNCTION akasha_ai.synthetic_share_final_state() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN ${body} END $$;
      CREATE TRIGGER synthetic_share_final_state AFTER INSERT ON akasha_ai.${target}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_share_final_state(); SET ROLE authenticated;`)
    try {
      await expect(track(db)).rejects.toMatchObject({ code: '55000' })
      expect(await snapshot(db)).toEqual({ shares: [], points: [], accounts: [] })
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER synthetic_share_final_state ON akasha_ai.${target};
        DROP FUNCTION akasha_ai.synthetic_share_final_state(); SET ROLE authenticated;`)
    }
  })
}

it('preserves the global INSERT/UPDATE/DELETE closure for all point types and balances', async () => {
  const proof = await track(db)
  const before = await snapshot(db)
  for (const sql of [
    "INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given) VALUES ($1,'forged',999)",
    "INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES ($1,999,'partage')",
    "INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES ($1,999,'other_existing_type')",
    'INSERT INTO akasha_ai.purama_points(user_id,balance) VALUES ($1,999)',
    ...['social_shares', 'point_transactions', 'purama_points'].map(table => `DELETE FROM akasha_ai.${table} WHERE user_id=$1`),
    'UPDATE akasha_ai.point_transactions SET amount=999 WHERE user_id=$1',
    "UPDATE akasha_ai.social_shares SET share_code='forged' WHERE user_id=$1",
    'UPDATE akasha_ai.purama_points SET balance=999 WHERE user_id=$1',
  ]) await expect(db.query(sql, [A])).rejects.toMatchObject({ code: '42501' })
  expect(proof.points).toBe(400)
  expect(await snapshot(db)).toEqual(before)
})

it.each(['anon', 'service_role'])('does not grant the user RPC to %s', async role => {
  await actor(db, A, role)
  await expect(track(db)).rejects.toMatchObject({ code: '42501' })
})

it('preserves legacy rows and counts the whole history beyond an API page', async () => {
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given,shared_at)
    SELECT $1,'historical',300,now()-interval '2 days' FROM generate_series(1,1005)`, [A])
  await db.exec(migration)
  await actor(db, A)
  await track(db)
  const value = await db.query<{ stats: unknown }>('SELECT akasha_ai.get_social_share_stats() AS stats')
  expect(value.rows[0].stats).toEqual({ version: 1, user_id: A, total_shares: 1006, points_earned: 301900, today_shares: 1 })
  await actor(db, B)
  expect((await db.query<{ stats: unknown }>('SELECT akasha_ai.get_social_share_stats() AS stats')).rows[0].stats)
    .toEqual({ version: 1, user_id: B, total_shares: 0, points_earned: 0, today_shares: 0 })
  await actor(db, null)
  await expect(db.query('SELECT akasha_ai.get_social_share_stats()')).rejects.toMatchObject({ code: '42501' })
})

it('uses UTC day boundaries independently of the database session time zone', async () => {
  await db.exec("RESET ROLE; SET TIME ZONE 'Pacific/Honolulu'")
  await db.query(`INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given,shared_at)
    VALUES ($1,'historical',400,((clock_timestamp() AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC')`, [A])
  await actor(db, A)
  expect((await track(db)).points).toBe(300)
})

it('rolls back an update skipped by the existing balance trigger', async () => {
  await track(db)
  const before = await snapshot(db)
  await db.exec(`RESET ROLE;
    CREATE FUNCTION akasha_ai.synthetic_balance_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER synthetic_balance_skip BEFORE UPDATE ON akasha_ai.purama_points
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_balance_skip(); SET ROLE authenticated;`)
  try {
    await expect(track(db, 2)).rejects.toMatchObject({ code: '55000' })
    expect(await snapshot(db)).toEqual(before)
  } finally {
    await db.exec(`RESET ROLE; DROP TRIGGER synthetic_balance_skip ON akasha_ai.purama_points;
      DROP FUNCTION akasha_ai.synthetic_balance_skip(); SET ROLE authenticated;`)
  }
})

it('replays an existing credit after spending without adding the points back', async () => {
  const first = await track(db)
  await db.exec('RESET ROLE; UPDATE akasha_ai.purama_points SET balance=20; SET ROLE authenticated')
  const before = await snapshot(db)
  expect(await track(db)).toEqual({ ...first, replayed: true })
  expect(await snapshot(db)).toEqual(before)
})

it('leaves only the canonical request-id share writer executable', async () => {
  const result = await db.query(`SELECT to_regprocedure('akasha_ai.track_social_share(uuid,uuid,text,text)') IS NULL AS absent,
    has_function_privilege('authenticated','akasha_ai.record_social_share(uuid,text,text)','EXECUTE') AS canonical`)
  expect(result.rows).toEqual([{ absent: true, canonical: true }])
})

it('retires the unpublished stats overload and keeps the versioned actor-bound aggregate', async () => {
  await db.exec(`RESET ROLE;
    CREATE FUNCTION akasha_ai.get_social_share_stats(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`)
  await db.exec(migration)
  await actor(db, A)
  expect((await db.query(`SELECT to_regprocedure('akasha_ai.get_social_share_stats(uuid)') IS NULL AS absent`)).rows)
    .toEqual([{ absent: true }])
  expect((await db.query<{ stats: unknown }>('SELECT akasha_ai.get_social_share_stats() AS stats')).rows[0].stats)
    .toEqual({ version: 1, user_id: A, total_shares: 0, points_earned: 0, today_shares: 0 })
})
