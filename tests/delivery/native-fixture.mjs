import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const root = fileURLToPath(new URL('../..', import.meta.url))
const markerFile = process.env.AKASHA_DELIVERY_FIXTURE_MARKER
const marker = JSON.parse(readFileSync(markerFile, 'utf8'))
assert.equal(marker.kind, 'akasha-delivery-owned-synthetic')
assert.equal(marker.port, Number(process.env.AKASHA_DELIVERY_FIXTURE_PORT))
const config = { host: '127.0.0.1', port: marker.port, user: 'akasha_delivery_fixture_owner',
  database: 'postgres', password: '', ssl: false, connectionTimeoutMillis: 2000,
  application_name: 'akasha-delivery-synthetic-qa' }
const admin = new pg.Client(config)
const lockObservations = []
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000001${i}`)
const migration = readFileSync(root + '/supabase/migrations/20261122_delivery_consistency.sql', 'utf8')
const tables = ['profiles', 'social_shares', 'point_transactions', 'purama_points', 'email_sequences',
  'point_shop_items', 'point_purchases', 'streaks', 'daily_gifts', 'user_coupons', 'lottery_draws', 'lottery_tickets',
  'contact_messages']
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
async function waitForBlocked(pid, blockingPid) {
  assert.ok(Number.isSafeInteger(pid) && Number.isSafeInteger(blockingPid))
  assert.notEqual(pid, blockingPid, 'The competing transaction must use an independent PostgreSQL backend')
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    await admin.query('SELECT pg_stat_clear_snapshot()')
    const rows = (await admin.query('SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocking_pids ' +
      'FROM pg_stat_activity WHERE pid=$1', [pid])).rows
    if (rows[0]?.wait_event_type === 'Lock' && rows[0].blocking_pids.includes(blockingPid)) {
      lockObservations.push({ observed_at_utc: new Date().toISOString(), blocking_pid: blockingPid, ...rows[0] })
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('The independent connection was not witnessed waiting on the expected transaction')
}
async function setupDeliveryFixture() {
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
        ? 'true' : table === 'contact_messages' ? 'false' : `auth.uid() = ${table === 'profiles' ? 'id' : 'user_id'}`});`)
  }
  await admin.query('GRANT UPDATE(role,credits), INSERT(id,role) ON akasha_ai.profiles TO PUBLIC,anon,authenticated')
  await admin.query(migration)
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_daily_gift_delivery.sql', 'utf8'))
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_points_redemption_authority.sql', 'utf8'))
  await admin.query(readFileSync(root + '/supabase/migrations/20261122_profile_write_boundary.sql', 'utf8'))
}
async function resetDeliveryFixture() {
  await admin.query('TRUNCATE auth.users, akasha_ai.lottery_draws CASCADE')
  await admin.query('INSERT INTO auth.users VALUES($1),($2)', [A, B])
  await admin.query("INSERT INTO akasha_ai.profiles(id,referral_code) VALUES($1,'ref-a'),($2,'ref-b')", [A, B])
}
async function closeDeliveryFixture() {
  try {
    writeFileSync(path.join(path.dirname(markerFile), 'native-observations.json'),
      JSON.stringify({ scope: 'Synthetic independent PostgreSQL backends; locks observed before the blocker commits',
        lock_observations: lockObservations }, null, 2) + '\n', { flag: 'wx' })
  } finally { await admin.end() }
}

async function seedPoints() {
  await admin.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,10000,10000)', [A])
  await admin.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,10000,'fixture')", [A])
}
const reward = (client, key = ids[0], item = 'credits-10', cost = 2000) => client.query(
  'SELECT akasha_ai.redeem_points_reward($1,$2,$3,$4) AS receipt', [A, cost, item, key]).then(r => r.rows[0].receipt)
export {
  A, B, ids, admin, connect, share, snapshot, waitForBlocked, seedPoints, reward,
  setupDeliveryFixture, resetDeliveryFixture, closeDeliveryFixture,
}
