import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = fileURLToPath(new URL('../..', import.meta.url))
const marker = JSON.parse(readFileSync(process.env.AKASHA_DELIVERY_FIXTURE_MARKER, 'utf8'))
assert.equal(marker.kind, 'akasha-delivery-owned-synthetic')
assert.equal(marker.port, Number(process.env.AKASHA_DELIVERY_FIXTURE_PORT))
const config = { host: '127.0.0.1', port: marker.port, user: 'akasha_delivery_fixture_owner',
  database: 'postgres', password: '', ssl: false, connectionTimeoutMillis: 2000,
  application_name: 'akasha-delivery-synthetic-qa' }
const admin = new pg.Client(config)
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000001${i}`)
const migration = readFileSync(root + '/supabase/migrations/20261122_delivery_consistency.sql', 'utf8')
const tables = ['profiles', 'social_shares', 'point_transactions', 'purama_points', 'email_sequences',
  'point_shop_items', 'point_purchases', 'streaks', 'daily_gifts', 'user_coupons', 'lottery_draws', 'lottery_tickets']
async function connect(userId = A, service = false) {
  const client = new pg.Client(config)
  await client.connect()
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
  await client.query('SET ROLE ' + (service ? 'service_role' : 'authenticated'))
  return client
}
async function share(client, id = ids[0], platform = 'whatsapp') {
  return (await client.query("SELECT akasha_ai.record_social_share($1,'ref-a',$2) AS receipt", [id, platform])).rows[0].receipt
}
async function snapshot() {
  return (await admin.query(`SELECT
    (SELECT count(*)::integer FROM akasha_ai.social_shares) AS shares,
    (SELECT count(*)::integer FROM akasha_ai.point_transactions) AS transactions,
    (SELECT coalesce(sum(amount),0)::integer FROM akasha_ai.point_transactions) AS ledger,
    (SELECT coalesce(sum(balance),0)::integer FROM akasha_ai.purama_points) AS balance`)).rows[0]
}
async function waitForBlocked(pid) {
  for (let i = 0; i < 100; i++) {
    const rows = (await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows
    if (rows[0]?.wait_event_type === 'Lock') return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('The independent connection did not reach a witnessed row lock')
}
before(async () => {
  await admin.connect()
  const identity = (await admin.query("SELECT current_setting('data_directory') AS path, current_user AS owner")).rows[0]
  assert.equal(identity.path, marker.cluster)
  assert.equal(identity.owner, config.user)
  await admin.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA akasha_ai; GRANT USAGE ON SCHEMA akasha_ai, auth TO anon, authenticated, service_role;`)
  const schema = readFileSync(root + '/schema.sql', 'utf8')
  for (const table of tables) {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.' + table + ' (')
    const end = schema.indexOf('\n);', start)
    assert.ok(start >= 0 && end > start)
    await admin.query(schema.slice(start, end + 3))
    await admin.query(`ALTER TABLE akasha_ai.${table} ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON akasha_ai.${table} TO authenticated, service_role;
      CREATE POLICY legacy_own ON akasha_ai.${table} FOR ALL USING(${['point_shop_items', 'lottery_draws'].includes(table)
        ? 'true' : `auth.uid() = ${table === 'profiles' ? 'id' : 'user_id'}`});`)
  }
  await admin.query(migration)
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_daily_gift_delivery.sql', 'utf8'))
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_points_redemption_authority.sql', 'utf8'))
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_profile_write_boundary.sql', 'utf8'))
})
beforeEach(async () => {
  await admin.query('TRUNCATE auth.users, akasha_ai.lottery_draws CASCADE')
  await admin.query('INSERT INTO auth.users VALUES($1),($2)', [A, B])
  await admin.query("INSERT INTO akasha_ai.profiles(id,referral_code) VALUES($1,'ref-a'),($2,'ref-b')", [A, B])
})
after(async () => { await admin.end() })

test('transaction commits the share, ledger and balance', async () => {
  const c = await connect()
  try { assert.equal((await share(c)).points, 400) }
  finally { await c.end() }
  assert.deepEqual(await snapshot(), { shares: 1, transactions: 1, ledger: 400, balance: 400 })
})
test('a blocked independent connection replays one request without double credit', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await c1.query('BEGIN')
    const first = await share(c1)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = share(c2)
    await waitForBlocked(pid)
    await c1.query('COMMIT')
    assert.deepEqual(await second, { ...first, replayed: true })
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
  assert.deepEqual(await snapshot(), { shares: 1, transactions: 1, ledger: 400, balance: 400 })
})
test('two waiting connections cannot both receive the first-share bonus', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await c1.query('BEGIN')
    assert.equal((await share(c1, ids[0])).points, 400)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = share(c2, ids[1])
    await waitForBlocked(pid)
    await c1.query('COMMIT')
    assert.equal((await second).points, 300)
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
  assert.deepEqual(await snapshot(), { shares: 2, transactions: 2, ledger: 700, balance: 700 })
})
test('concurrent fourth share is refused after the third commits', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await share(c1, ids[0]); await share(c1, ids[1]); await c1.query('BEGIN'); await share(c1, ids[2])
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const fourth = share(c2, ids[3]).then(value => ({ value }), error => ({ error }))
    await waitForBlocked(pid)
    await c1.query('COMMIT')
    assert.match((await fourth).error.message, /maximum 3/)
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
  assert.deepEqual(await snapshot(), { shares: 3, transactions: 3, ledger: 1000, balance: 1000 })
})
for (const table of ['point_transactions', 'purama_points']) {
  test('failure in ' + table + ' rolls back every side effect', async () => {
    await admin.query(`CREATE FUNCTION akasha_ai.synthetic_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'synthetic downstream failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON akasha_ai.${table}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_delivery_failure();`)
    const c = await connect()
    try {
      await assert.rejects(share(c), /synthetic downstream failure/)
      assert.deepEqual(await snapshot(), { shares: 0, transactions: 0, ledger: 0, balance: 0 })
    } finally {
      await c.end()
      await admin.query(`DROP TRIGGER synthetic_failure ON akasha_ai.${table}; DROP FUNCTION akasha_ai.synthetic_delivery_failure()`)
    }
  })
}
test('client privileges cannot forge points, share records or email history', async () => {
  const c = await connect()
  try {
    await assert.rejects(c.query("INSERT INTO akasha_ai.social_shares(user_id,share_code) VALUES($1,'ref-a')", [A]), /permission denied/)
    await assert.rejects(c.query('INSERT INTO akasha_ai.purama_points(user_id,balance) VALUES($1,99999)', [A]), /permission denied/)
    await assert.rejects(c.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,99999,'partage')", [A]), /permission denied/)
    await assert.rejects(c.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [A]), /permission denied/)
    await assert.rejects(c.query("SELECT akasha_ai.record_social_share($1,'ref-b','whatsapp')", [ids[0]]), /profile mismatch/)
  } finally { await c.end() }
})
test('email confirmation is deduplicated across a witnessed lock', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  const query = "SELECT akasha_ai.record_email_sequence_delivery($1,'welcome') AS inserted"
  try {
    await c1.query('BEGIN'); assert.equal((await c1.query(query, [A])).rows[0].inserted, true)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = c2.query(query, [A])
    await waitForBlocked(pid)
    await c1.query('COMMIT')
    assert.equal((await second).rows[0].inserted, false)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.email_sequences')).rows[0].n, 1)
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
})
async function seedPoints() {
  await admin.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,10000,10000)', [A])
  await admin.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,10000,'fixture')", [A])
}
const reward = (client, key = ids[0], item = 'credits-10', cost = 2000) => client.query(
  'SELECT akasha_ai.redeem_points_reward($1,$2,$3,$4) AS receipt', [A, cost, item, key]).then(r => r.rows[0].receipt)
test('legacy debit-only and direct browser reward calls are denied', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await seedPoints()
    await assert.rejects(user.query("SELECT * FROM akasha_ai.redeem_points($1,1,'cash-1000')", [A]), /permission denied/)
    await assert.rejects(service.query("SELECT * FROM akasha_ai.redeem_points($1,1,'cash-1000')", [A]), /permission denied/)
    await assert.rejects(reward(user), /permission denied/)
    assert.equal((await reward(service)).new_balance, 8000)
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 10)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await Promise.all([user.end(), service.end()]) }
})
test('two connections replay the same purchase with one debit and one delivered reward', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    const first = await reward(c1)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = reward(c2)
    await waitForBlocked(pid); await c1.query('COMMIT')
    assert.deepEqual(await second, { ...first, replayed: true })
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.point_purchases')).rows[0].n, 1)
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 10)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
})
test('two competing rewards cannot overdraw the same points balance', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    assert.equal((await reward(c1, ids[0], 'credits-50', 8000)).new_balance, 2000)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = reward(c2, ids[1], 'credits-50', 8000)
    await waitForBlocked(pid); await c1.query('COMMIT')
    assert.deepEqual(await second, { success: false, reason: 'insufficient_points' })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 2000, balance: 2000 })
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
})
test('a share waiting for a redemption preserves both balance changes', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await seedPoints(); await service.query('BEGIN'); await reward(service)
    const pid = (await user.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingShare = share(user, ids[1])
    await waitForBlocked(pid); await service.query('COMMIT')
    assert.equal((await pendingShare).points, 400)
    assert.deepEqual(await snapshot(), { shares: 1, transactions: 3, ledger: 8400, balance: 8400 })
  } finally { await service.query('ROLLBACK'); await Promise.all([user.end(), service.end()]) }
})
test('missing ticket draw or unsupported reward never debits points', async () => {
  const service = await connect(A, true)
  try {
    await seedPoints()
    assert.deepEqual(await reward(service, ids[0], 'ticket-1', 500), { success: false, reason: 'no_draw' })
    assert.deepEqual(await reward(service, ids[0], 'cash-250', 25000), { success: false, reason: 'unavailable' })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 1, ledger: 10000, balance: 10000 })
    await admin.query("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    assert.equal((await reward(service, ids[0], 'ticket-1', 500)).fulfilled, true)
    assert.equal((await reward(service, ids[0], 'ticket-1', 500)).replayed, true)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.lottery_tickets')).rows[0].n, 1)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 9500, balance: 9500 })
  } finally { await service.end() }
})
test('a share waiting for a daily gift cannot overwrite the gift credit', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await service.query('BEGIN')
    await service.query("SELECT akasha_ai.claim_daily_gift($1,'points',7,0)", [A])
    const pid = (await user.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingShare = share(user)
    await waitForBlocked(pid); await service.query('COMMIT')
    await pendingShare
    assert.deepEqual(await snapshot(), { shares: 1, transactions: 2, ledger: 407, balance: 407 })
  } finally { await service.query('ROLLBACK'); await Promise.all([user.end(), service.end()]) }
})
test('daily credit gift and redeemed credits compose under a witnessed lock', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    await c1.query("SELECT akasha_ai.claim_daily_gift($1,'credits',3,0)", [A])
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pending = reward(c2)
    await waitForBlocked(pid); await c1.query('COMMIT'); await pending
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 13)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
})
test('a concurrent daily gift request replays the committed reward once', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  const query = "SELECT akasha_ai.claim_daily_gift($1,'points',7,0) AS receipt"
  try {
    await c1.query('BEGIN'); const first = (await c1.query(query, [A])).rows[0].receipt
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const replay = c2.query(query, [A])
    await waitForBlocked(pid); await c1.query('COMMIT')
    assert.deepEqual((await replay).rows[0].receipt, { ...first, replayed: true })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 1, ledger: 7, balance: 7 })
  } finally { await c1.query('ROLLBACK'); await Promise.all([c1.end(), c2.end()]) }
})
test('a failed daily reward journal rolls back the claim and permits safe retry', async () => {
  const service = await connect(A, true)
  await admin.query(`CREATE FUNCTION akasha_ai.synthetic_gift_failure() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic gift failure'; END $$;
    CREATE TRIGGER synthetic_gift_failure BEFORE INSERT ON akasha_ai.point_transactions
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_gift_failure();`)
  try {
    await assert.rejects(service.query("SELECT akasha_ai.claim_daily_gift($1,'points',7,0)", [A]), /synthetic gift failure/)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.daily_gifts')).rows[0].n, 0)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 0, ledger: 0, balance: 0 })
  } finally {
    await admin.query('DROP TRIGGER synthetic_gift_failure ON akasha_ai.point_transactions; DROP FUNCTION akasha_ai.synthetic_gift_failure()')
    await service.end()
  }
})
test('profile write boundary preserves own settings and rejects privileges or credits', async () => {
  const user = await connect()
  try {
    for (const statement of ["UPDATE akasha_ai.profiles SET credits=99999 WHERE id=$1",
      "UPDATE akasha_ai.profiles SET role='super_admin' WHERE id=$1", "UPDATE akasha_ai.profiles SET plan='complete' WHERE id=$1"]) {
      await assert.rejects(user.query(statement, [A]), /permission denied/)
    }
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET bio='Own setting' WHERE id=$1", [A])).rowCount, 1)
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET bio='Foreign setting' WHERE id=$1", [B])).rowCount, 0)
  } finally { await user.end() }
})
