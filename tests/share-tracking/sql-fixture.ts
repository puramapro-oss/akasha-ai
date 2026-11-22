import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { databaseFixture, resetFixture } from '../../src/lib/share/delivery-sql.test-support'

export const A = '00000000-0000-4000-8000-000000000001'
export const B = '00000000-0000-4000-8000-000000000002'
export const operationId = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0')
export const migration = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261122170200_social_share_tracking_atomic.sql', import.meta.url)), 'utf8')
export async function database() {
  return databaseFixture()
}
export async function reset(db: PGlite) {
  await resetFixture(db)
}
export async function actor(db: PGlite, id: string | null, role = 'authenticated') {
  if (!['authenticated', 'anon', 'service_role'].includes(role)) throw new Error('Invalid fixture role')
  await db.exec('RESET ROLE; SET ROLE ' + role)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id ?? ''])
}
export async function track(db: PGlite, id = 1, changes: Record<string, unknown> = {}) {
  const args = { operation: operationId(id), code: 'ref-a', platform: 'native', ...changes }
  const result = await db.query<{ receipt: Record<string, unknown> }>(
    'SELECT akasha_ai.record_social_share($1::uuid,$2::text,$3::text) AS receipt',
    [args.operation, args.code, args.platform])
  return result.rows[0].receipt
}
export async function snapshot(db: PGlite) {
  await db.exec('RESET ROLE')
  const value = {
    shares: (await db.query('SELECT * FROM akasha_ai.social_shares ORDER BY id')).rows,
    points: (await db.query('SELECT * FROM akasha_ai.point_transactions ORDER BY id')).rows,
    accounts: (await db.query('SELECT * FROM akasha_ai.purama_points ORDER BY id')).rows,
  }
  await db.exec('SET ROLE authenticated')
  return value
}
