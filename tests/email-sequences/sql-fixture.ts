import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const USER = '11111111-1111-4111-8111-111111111111'
export const ATTEMPT = '22222222-2222-4222-8222-222222222222'
export const SECOND_ATTEMPT = '33333333-3333-4333-8333-333333333333'
export const HASH = 'a'.repeat(64)
export const RECIPIENT = 'recipient@example.invalid'
const source = (file: string) => fileURLToPath(new URL('../../' + file, import.meta.url))
export async function emailDatabase(options: {
  incoming?: boolean
  beforeDelivery?: (db: PGlite) => Promise<void>
} = {}) {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE SCHEMA akasha_ai;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,akasha_ai TO anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`)
    const schema = readFileSync(source('schema.sql'), 'utf8')
    if (options.incoming) {
      // Include the real auth/profile triggers and every prerequisite used by
      // the append-only boundary migration before the durable email overlay.
      await db.exec(schema)
      await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA akasha_ai TO authenticated,service_role')
      for (const file of [
        '20260926_daily_gift_atomic_claim.sql',
        '20260926_points_redeem_atomic.sql',
        '20261122165000_delivery_consistency.sql',
        '20261122165100_daily_gift_delivery.sql',
        '20261122165200_points_redemption_authority.sql',
        '20261122165300_profile_write_boundary.sql',
        '20261123010000_reward_boundaries.sql',
      ]) await db.exec(readFileSync(source('supabase/migrations/' + file), 'utf8'))
    } else {
      for (const table of ['profiles', 'notification_preferences', 'email_sequences']) {
        const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS akasha_ai.${table} (`)
        const end = schema.indexOf('\n);', start)
        if (start < 0 || end < 0) throw new Error('Versioned fixture table missing: ' + table)
        await db.exec(schema.slice(start, end + 3))
      }
    }
    await options.beforeDelivery?.(db)
    await db.exec(readFileSync(source('supabase/migrations/20261123010200_email_sequence_delivery.sql'), 'utf8'))
    await db.exec('GRANT USAGE ON SCHEMA akasha_ai TO anon, authenticated, service_role')
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}
export async function resetEmailDatabase(db: PGlite) {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE')
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [USER])
  await db.query('INSERT INTO akasha_ai.profiles(id,email) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email', [USER, RECIPIENT])
  await db.query('INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,$2)', [USER, { newsletter: true }])
  await db.exec('SET ROLE service_role')
}
export async function emailRpc(db: PGlite, name: 'claim' | 'complete' | 'reconcile', overrides: Record<string, unknown> = {}) {
  const input: Record<string, unknown> = {
    p_user_id: USER, p_email_type: 'welcome', p_attempt_token: ATTEMPT, p_payload_hash: HASH,
    ...(name === 'claim' ? { p_recipient: RECIPIENT } : { p_provider_email_id: 'synthetic-provider-id' }),
    ...(name === 'reconcile' ? { p_reason: 'completion_unconfirmed' } : {}), ...overrides,
  }
  const args = Object.keys(input).map((key, index) => key + ' => $' + (index + 1)).join(',')
  const result = await db.query<{ receipt: Record<string, unknown> }>(
    `SELECT akasha_ai.${name}_email_sequence_delivery(${args}) AS receipt`, Object.values(input))
  return result.rows[0].receipt
}
export async function inspectEmailDatabase(db: PGlite) {
  await db.exec('RESET ROLE')
  try {
    const journals = await db.query('SELECT user_id,email_type,state,attempt_token,provider_email_id,reason FROM akasha_ai.email_sequence_deliveries ORDER BY email_type')
    const logs = await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM akasha_ai.email_sequences')
    return { journals: journals.rows, logs: logs.rows[0].count }
  } finally { await db.exec('SET ROLE service_role') }
}
