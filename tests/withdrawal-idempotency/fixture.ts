import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { WithdrawalDatabase, WithdrawalIdentity } from '../../src/lib/stripe/withdrawal-contract'

export const USER = '00000000-0000-4000-8000-000000000001'
export const OTHER = '00000000-0000-4000-8000-000000000002'
export const KEY = '10000000-0000-4000-8000-000000000001'
export const SECOND_KEY = '10000000-0000-4000-8000-000000000002'
export const ATTEMPT = '20000000-0000-4000-8000-000000000001'
export const identity: WithdrawalIdentity = { userId: USER, requestKey: KEY, requestedAmount: 20, mode: 'test' }
const source = (path: string) => readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8')
export const migration = source('supabase/migrations/20261123010100_akasha_withdrawal_idempotency.sql')

export async function database() {
  const db = new PGlite()
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;'
    + 'CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY); CREATE SCHEMA akasha_ai;')
  const schema = source('schema.sql')
  const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.profiles (')
  const end = schema.indexOf('\n);', start)
  if (start < 0 || end < 0) throw new Error('Canonical profile definition missing')
  await db.exec(schema.slice(start, end + 3))
  await db.exec(source('tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql'))
  await db.exec(migration)
  return db
}

export async function reset(db: PGlite, balance = 100) {
  await db.exec('RESET ROLE; DROP TRIGGER IF EXISTS reject_receipt ON public.connect_withdrawals;'
    + 'DROP TRIGGER IF EXISTS reject_debit ON akasha_ai.profiles; TRUNCATE auth.users CASCADE;')
  await db.query('INSERT INTO auth.users (id) VALUES ($1),($2)', [USER, OTHER])
  await db.query('INSERT INTO akasha_ai.profiles (id,wallet_balance) VALUES ($1,$3),($2,$3)',
    [USER, OTHER, balance])
  await db.exec('SET ROLE service_role')
}

export function bridge(db: PGlite): WithdrawalDatabase {
  return { async rpc(name, args) {
    if (!/^(get|cancel|reserve|claim|complete|reject|reconcile)_akasha_withdrawal$/.test(name)) {
      throw new Error('Unexpected financial RPC: ' + name)
    }
    const entries = Object.entries(args)
    if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid argument')
    try {
      const result = await db.query<{ receipt: unknown }>('SELECT public.' + name + '('
        + entries.map(([key], i) => key + ' => $' + (i + 1)).join(',') + ') AS receipt',
      entries.map(([, value]) => typeof value === 'object' && value !== null ? JSON.stringify(value) : value))
      return { data: result.rows[0]?.receipt ?? null, error: null }
    } catch (error) { return { data: null, error: { message: String(error) } } }
  } }
}

export async function snapshot(db: PGlite) {
  await db.exec('RESET ROLE')
  const balances = (await db.query<Record<string, unknown>>('SELECT id,wallet_balance FROM akasha_ai.profiles ORDER BY id')).rows
  const requests = (await db.query<Record<string, unknown>>('SELECT * FROM akasha_ai.withdrawal_requests ORDER BY created_at,id')).rows
  const receipts = (await db.query<Record<string, unknown>>('SELECT * FROM public.connect_withdrawals ORDER BY created_at,id')).rows
  await db.exec('SET ROLE service_role')
  return { balances, requests, receipts }
}

export const reserveArgs = (changes: Record<string, unknown> = {}) => ({
  p_user_id: USER, p_request_key: KEY, p_amount_eur: 20, p_requested_amount_eur: 20,
  p_stripe_account_id: 'acct_synthetic', p_mode: 'test', p_fraud_metadata: {}, p_daily_cap: 50,
  ...changes,
})
export const claimArgs = { p_user_id: USER, p_request_key: KEY, p_attempt_token: ATTEMPT }
export const completeArgs = { ...claimArgs, p_transfer_id: 'tr_synthetic', p_amount_eur: 20,
  p_destination: 'acct_synthetic', p_mode: 'test' }
