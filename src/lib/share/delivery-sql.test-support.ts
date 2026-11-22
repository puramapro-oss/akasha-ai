import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const USER_A = '00000000-0000-4000-8000-000000000001'
export const USER_B = '00000000-0000-4000-8000-000000000002'
export const REQUEST_A = '00000000-0000-4000-8000-000000000011'
export const REQUEST_B = '00000000-0000-4000-8000-000000000012'
export const REQUEST_C = '00000000-0000-4000-8000-000000000013'
export const REQUEST_D = '00000000-0000-4000-8000-000000000014'
const source = (name: string) => readFileSync(fileURLToPath(new URL('../../../supabase/migrations/' + name, import.meta.url)), 'utf8')
export const incomingMigration = source('20261122165000_delivery_consistency.sql')
export const migration = source('20261123010300_social_share_tracking_atomic.sql')
export const rewardBoundaries = source('20261123010000_reward_boundaries.sql')
const tables = ['profiles', 'social_shares', 'point_transactions', 'purama_points', 'email_sequences',
  'notification_preferences', 'point_shop_items', 'point_purchases', 'lottery_draws', 'lottery_tickets',
  'streaks', 'daily_gifts', 'user_coupons', 'contact_messages']

export async function databaseFixture(options: { final?: boolean; reuse?: PGlite } = {}) {
  const db = options.reuse ?? new PGlite()
  if (options.reuse) {
    // Historical migration cases need a fresh schema, not another WASM engine.
    // This reset is confined to the explicitly supplied in-memory test fixture.
    await db.exec(`ROLLBACK; RESET ROLE; DROP SCHEMA akasha_ai CASCADE; DROP SCHEMA auth CASCADE;
      DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;
      DROP ROLE anon, authenticated, public_only, service_role;`)
  }
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE public_only NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA akasha_ai;
    GRANT USAGE ON SCHEMA akasha_ai, auth TO anon, authenticated, public_only, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA akasha_ai GRANT ALL ON TABLES TO PUBLIC, anon, authenticated, service_role;
  `)
  const schema = readFileSync(fileURLToPath(new URL('../../../schema.sql', import.meta.url)), 'utf8')
  // Execute the canonical schema, including its auth/profile/streak triggers.
  // The broad grants and permissive policies below model a synthetic legacy installation.
  await db.exec(schema)
  for (const table of tables) {
    await db.exec(`ALTER TABLE akasha_ai.${table} ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON akasha_ai.${table} TO PUBLIC, anon, authenticated, service_role;
      CREATE POLICY legacy_own ON akasha_ai.${table} FOR ALL USING(${['point_shop_items', 'lottery_draws'].includes(table)
        ? 'true' : table === 'contact_messages' ? 'false' : `auth.uid() = ${table === 'profiles' ? 'id' : 'user_id'}`});`)
  }
  // Preserve the two versioned historical prerequisites and the actual signup
  // triggers before loading the nine new delivery migrations in reviewed order.
  await db.exec(source('20260926_daily_gift_atomic_claim.sql'))
  await db.exec(source('20260926_points_redeem_atomic.sql'))
  await db.exec('GRANT UPDATE(role,credits), INSERT(id,role), REFERENCES(role) ON akasha_ai.profiles TO PUBLIC,anon,authenticated')
  const connect = readFileSync(fileURLToPath(new URL('../../../tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql', import.meta.url)), 'utf8')
  await db.exec(connect)
  await db.exec(incomingMigration)
  for (const name of ['20261122165100_daily_gift_delivery.sql', '20261122165200_points_redemption_authority.sql',
    '20261122165300_profile_write_boundary.sql']) {
    await db.exec(source(name))
  }
  await db.exec(rewardBoundaries)
  if (options.final !== false) await applyConsolidation(db)
  return db
}

export async function applyConsolidation(db: PGlite) {
  for (const name of ['20261123010100_akasha_withdrawal_idempotency.sql',
    '20261123010200_email_sequence_delivery.sql', '20261123010300_social_share_tracking_atomic.sql',
    '20261123010400_delivery_receipts_export.sql']) await db.exec(source(name))
}

export async function resetFixture(db: PGlite) {
  await db.exec('RESET ROLE; SET TIME ZONE UTC; TRUNCATE auth.users, akasha_ai.lottery_draws CASCADE;')
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture-a@example.invalid'),($2,'fixture-b@example.invalid')", [USER_A, USER_B])
  await db.query('UPDATE akasha_ai.profiles SET referral_code=CASE id WHEN $1::uuid THEN $2 ELSE $4 END WHERE id IN($1,$3)', [USER_A, 'ref-a', USER_B, 'ref-b'])
  await asUser(db, USER_A)
}
export async function asUser(db: PGlite, userId: string) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec('SET ROLE authenticated')
}
export async function share(db: PGlite, requestId: string | null = REQUEST_A, code = 'ref-a', platform = 'whatsapp') {
  const result = await db.query<{ receipt: Record<string, unknown> }>(
    'SELECT akasha_ai.record_social_share($1, $2, $3) AS receipt', [requestId, code, platform])
  return result.rows[0].receipt
}
export async function snapshot(db: PGlite) {
  await db.exec('RESET ROLE')
  const result = await db.query(`SELECT
    (SELECT count(*)::integer FROM akasha_ai.social_shares) AS shares,
    (SELECT count(*)::integer FROM akasha_ai.point_transactions) AS transactions,
    (SELECT coalesce(sum(amount),0)::integer FROM akasha_ai.point_transactions) AS ledger,
    (SELECT coalesce(sum(balance),0)::integer FROM akasha_ai.purama_points) AS balance,
    (SELECT coalesce(sum(lifetime_earned),0)::integer FROM akasha_ai.purama_points) AS lifetime`)
  await db.exec('SET ROLE authenticated')
  return result.rows[0]
}

export async function storedRows(db: PGlite, names: string[]) {
  const role = (await db.query<{ role: string }>('SELECT current_user AS role')).rows[0].role
  await db.exec('RESET ROLE')
  try {
    const state: Record<string, unknown[]> = {}
    for (const name of names) state[name] = (await db.query('SELECT * FROM akasha_ai.' + name + ' ORDER BY id')).rows
    return state
  } finally { await db.exec('SET ROLE "' + role.replaceAll('"', '""') + '"') }
}

export async function withRewrite(db: PGlite, table: string, operation: string, body: string, action: () => Promise<void>) {
  const role = (await db.query<{ role: string }>('SELECT current_user AS role')).rows[0].role
  const restore = () => db.exec('SET ROLE "' + role.replaceAll('"', '""') + '"')
  await db.exec(`RESET ROLE;
    CREATE FUNCTION akasha_ai.delivery_rewrite_fixture() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN ${body} END $$;
    CREATE TRIGGER delivery_rewrite_fixture BEFORE ${operation} ON akasha_ai.${table}
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.delivery_rewrite_fixture();`)
  try { await restore(); await action() }
  finally {
    await db.exec(`RESET ROLE; DROP TRIGGER delivery_rewrite_fixture ON akasha_ai.${table};
      DROP FUNCTION akasha_ai.delivery_rewrite_fixture();`)
    await restore()
  }
}
