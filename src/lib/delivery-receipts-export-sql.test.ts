import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PGlite } from '@electric-sql/pglite'
import { emailDatabase, USER, ATTEMPT, HASH } from '../../tests/email-sequences/sql-fixture'

const other = '44444444-4444-4444-8444-444444444444'
const key = '55555555-5555-4555-8555-555555555555'
const cancelledKey = '66666666-6666-4666-8666-666666666666'
const source = (relative: string) => readFileSync(fileURLToPath(new URL('../../' + relative, import.meta.url)), 'utf8')
let db: PGlite
beforeAll(async () => {
  db = await emailDatabase()
  await db.exec(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`)
  await db.exec(source('tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql'))
  await db.exec(source('supabase/migrations/20261123010100_akasha_withdrawal_idempotency.sql'))
  await db.exec(source('supabase/migrations/20261123010400_delivery_receipts_export.sql'))
  for (const id of [USER, other]) {
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id])
    await db.query('INSERT INTO akasha_ai.profiles(id,email,wallet_balance) VALUES($1,$2,100)', [id, id + '@example.invalid'])
    await db.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [id])
    await db.query('SELECT akasha_ai.claim_email_sequence_delivery($1,$2,$3,$4,$5)', [id, 'welcome', ATTEMPT, HASH, id + '@example.invalid'])
    await db.query('SELECT public.cancel_akasha_withdrawal($1,$2)', [id, cancelledKey])
    await db.query('SELECT public.reserve_akasha_withdrawal($1,$2,20,20,$3,$4,$5,50)',
      [id, key, 'acct_synthetic', 'test', { internal_fraud_fixture: 'not_for_export' }])
  }
})
afterAll(async () => { await db?.close() })

describe('SQL personal export keeps private journal access narrow', () => {
  it('refuses anonymous and signed-out callers', async () => {
    await db.exec('SET ROLE anon')
    await expect(db.query('SELECT akasha_ai.export_own_delivery_receipts()')).rejects.toMatchObject({ code: '42501' })
    await db.exec('SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    await expect(db.query('SELECT akasha_ai.export_own_delivery_receipts()')).rejects.toMatchObject({ code: '42501' })
  })

  it('exports the current actor only, while the three private journals remain unreadable directly', async () => {
    await db.exec('SET ROLE authenticated')
    for (const id of [USER, other]) {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
      const result = await db.query<{ receipt: { version: number; user_id: string; emails: unknown[]; withdrawals: unknown[]; withdrawal_cancellations: unknown[] } }>(
        'SELECT akasha_ai.export_own_delivery_receipts() AS receipt')
      expect(result.rows[0].receipt.user_id).toBe(id)
      expect(result.rows[0].receipt.emails).toHaveLength(1)
      expect(result.rows[0].receipt.withdrawals).toHaveLength(1)
      expect(result.rows[0].receipt.withdrawal_cancellations).toHaveLength(1)
      const serialized = JSON.stringify(result.rows[0].receipt)
      for (const forbidden of ['attempt_token', 'payload_hash', 'fraud_metadata', 'request_key', ATTEMPT, HASH, cancelledKey, 'not_for_export']) {
        expect(serialized).not.toContain(forbidden)
      }
      await expect(db.query('SELECT * FROM akasha_ai.email_sequence_deliveries')).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('SELECT * FROM akasha_ai.withdrawal_requests')).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('SELECT * FROM akasha_ai.withdrawal_cancellations')).rejects.toMatchObject({ code: '42501' })
    }
  })

  it('provides no overload taking a foreign user id and cannot modify the journals', async () => {
    await db.exec('SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [USER])
    await expect(db.query('SELECT akasha_ai.export_own_delivery_receipts($1)', [other])).rejects.toMatchObject({ code: '42883' })
    await expect(db.query("UPDATE akasha_ai.withdrawal_requests SET state='completed'")).rejects.toMatchObject({ code: '42501' })
  })
})
