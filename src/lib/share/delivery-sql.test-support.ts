import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const USER_A = '00000000-0000-4000-8000-000000000001'
export const USER_B = '00000000-0000-4000-8000-000000000002'
export const REQUEST_A = '00000000-0000-4000-8000-000000000011'
export const REQUEST_B = '00000000-0000-4000-8000-000000000012'
export const REQUEST_C = '00000000-0000-4000-8000-000000000013'
export const REQUEST_D = '00000000-0000-4000-8000-000000000014'
export const migration = readFileSync(fileURLToPath(new URL('../../../supabase/migrations/20261122_delivery_consistency.sql', import.meta.url)), 'utf8')
const tables = ['profiles', 'social_shares', 'point_transactions', 'purama_points', 'email_sequences',
  'point_shop_items', 'point_purchases', 'lottery_draws', 'lottery_tickets']

export async function databaseFixture() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA akasha_ai;
    GRANT USAGE ON SCHEMA akasha_ai, auth TO anon, authenticated, service_role;
  `)
  const schema = readFileSync(fileURLToPath(new URL('../../../schema.sql', import.meta.url)), 'utf8')
  for (const table of tables) {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.' + table + ' (')
    const end = schema.indexOf('\n);', start)
    if (start < 0 || end < 0) throw new Error('Versioned table missing: ' + table)
    await db.exec(schema.slice(start, end + 3))
    await db.exec(`ALTER TABLE akasha_ai.${table} ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON akasha_ai.${table} TO authenticated, service_role;
      CREATE POLICY legacy_own ON akasha_ai.${table} FOR ALL USING(${['point_shop_items', 'lottery_draws'].includes(table)
        ? 'true' : `auth.uid() = ${table === 'profiles' ? 'id' : 'user_id'}`});`)
  }
  await db.exec(migration)
  return db
}

export async function resetFixture(db: PGlite) {
  await db.exec('RESET ROLE; TRUNCATE auth.users, akasha_ai.lottery_draws CASCADE;')
  await db.query('INSERT INTO auth.users VALUES($1), ($2)', [USER_A, USER_B])
  await db.query('INSERT INTO akasha_ai.profiles(id, referral_code) VALUES($1, $2), ($3, $4)', [USER_A, 'ref-a', USER_B, 'ref-b'])
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
