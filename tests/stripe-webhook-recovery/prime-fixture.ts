import { PGlite } from '@electric-sql/pglite'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type Values = Record<string, unknown>
type Result = { data: Values | null; error: { message: string } | null }
const source = (path: string) => fileURLToPath(new URL('../../' + path, import.meta.url))
export const PRIME_MIGRATION = source('supabase/migrations/20261111_prime_j1_atomic.sql')
export const PROFILE_MIGRATION = source('supabase/migrations/20261112_prime_j1_profile_atomic.sql')
export const USER_ONE = '00000000-0000-4000-8000-000000000001'
export const USER_TWO = '00000000-0000-4000-8000-000000000002'

function tableDefinition(schema: string, table: string): string {
  const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.' + table + ' (')
  const end = schema.indexOf('\n);', start)
  if (start < 0 || end < 0) throw new Error('Versioned fixture definition missing: ' + table)
  return schema.slice(start, end + 3)
}

export async function createPrimeDatabase() {
  // No data directory, TCP socket, server, credential or existing database.
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE SCHEMA akasha_ai;
  `)
  const schema = readFileSync(source('schema.sql'), 'utf8')
  for (const table of ['profiles', 'wallets', 'wallet_transactions', 'stripe_events']) {
    await db.exec(tableDefinition(schema, table))
  }
  await db.exec(readFileSync(source('supabase/migrations/20260926_stripe_events_processed.sql'), 'utf8'))
  await db.exec(readFileSync(source('supabase/migrations/20261111_stripe_webhook_journal.sql'), 'utf8'))
  if (existsSync(PRIME_MIGRATION)) await db.exec(readFileSync(PRIME_MIGRATION, 'utf8'))
  // Explicit dependency order, independent of directory enumeration or a CLI.
  if (existsSync(PROFILE_MIGRATION)) {
    await db.exec(readFileSync(PROFILE_MIGRATION, 'utf8'))
  }
  await db.exec(`
    GRANT USAGE ON SCHEMA akasha_ai TO service_role;
    GRANT ALL ON akasha_ai.profiles, akasha_ai.wallets,
      akasha_ai.wallet_transactions TO service_role;
  `)
  return db
}

export async function resetPrimeDatabase(db: PGlite) {
  await db.exec('RESET ROLE; TRUNCATE auth.users, akasha_ai.stripe_webhook_journal CASCADE;')
  await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [USER_ONE, USER_TWO])
  await db.query(`INSERT INTO akasha_ai.profiles(id, stripe_customer_id)
    VALUES ($1, 'cus_synthetic_prime'), ($2, 'cus_synthetic_prime_other')`, [USER_ONE, USER_TWO])
  await db.exec('SET ROLE service_role')
}

function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid fixture identifier')
  return '"' + value + '"'
}

/** Supabase-shaped transport; every read/write is real in-process PostgreSQL SQL. */
export function primeSqlBridge(db: PGlite) {
  const state = {
    legacyInsertBarrier: null as null | (() => Promise<void>),
    legacyInsertEntrants: 0,
    errors: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Values }>,
  }
  const failure = (error: unknown): Result => {
    const message = error instanceof Error ? error.message : String(error)
    state.errors.push(message)
    return { data: null, error: { message } }
  }

  function from(table: string) {
    if (!['profiles', 'wallets', 'wallet_transactions'].includes(table)) {
      throw new Error('Unexpected table boundary: ' + table)
    }
    let operation: 'select' | 'insert' | 'upsert' | 'update' = 'select'
    let values: Values = {}
    let selected = '*'
    let maximum: number | null = null
    const filters: Array<[string, string, unknown]> = []
    const query = {
      select(columns = '*') { selected = columns; return query },
      update(data: Values) { operation = 'update'; values = data; return query },
      insert(data: Values) { operation = 'insert'; values = data; return query },
      upsert(data: Values) { operation = 'upsert'; values = data; return query },
      eq(column: string, value: unknown) { filters.push([column, '=', value]); return query },
      ilike(column: string, value: unknown) { filters.push([column, 'ILIKE', value]); return query },
      limit(value: number) { maximum = value; return query },
      async single() { return execute(false) },
      async maybeSingle() { return execute(true) },
    }
    async function execute(optional: boolean): Promise<Result> {
      try {
        const args: unknown[] = []
        const bind = (value: unknown) => { args.push(value); return '$' + args.length }
        const columns = selected === '*' ? '*' : selected.split(',').map(x => identifier(x.trim())).join(', ')
        const target = 'akasha_ai.' + identifier(table)
        let sql = ''
        if (operation === 'insert' || operation === 'upsert') {
          const keys = Object.keys(values)
          sql = 'INSERT INTO ' + target + ' (' + keys.map(identifier).join(', ') + ') VALUES ('
            + keys.map(key => bind(values[key])).join(', ') + ')'
          if (operation === 'upsert') sql += ' ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id'
          if (table === 'wallet_transactions' && state.legacyInsertBarrier) {
            state.legacyInsertEntrants++
            await state.legacyInsertBarrier()
          }
        } else if (operation === 'update') {
          sql = 'UPDATE ' + target + ' SET ' + Object.entries(values)
            .map(([key, value]) => identifier(key) + ' = ' + bind(value)).join(', ')
        } else sql = 'SELECT ' + columns + ' FROM ' + target
        if (filters.length) sql += ' WHERE ' + filters
          .map(([key, comparison, value]) => identifier(key) + ' ' + comparison + ' ' + bind(value)).join(' AND ')
        if (operation === 'select' && maximum !== null) {
          if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid fixture limit')
          sql += ' LIMIT ' + maximum
        }
        if (operation !== 'select') sql += ' RETURNING ' + columns
        const result = await db.query<Values>(sql, args)
        if (result.rows.length > 1 || (!optional && result.rows.length !== 1)) {
          throw new Error('Synthetic PostgREST cardinality rejection')
        }
        return { data: result.rows[0] ?? null, error: null }
      } catch (error) { return failure(error) }
    }
    return query
  }

  async function rpc(name: string, args: Values) {
    const allowed = ['admit_stripe_webhook_event', 'complete_stripe_webhook_event',
      'reconcile_stripe_webhook_event', 'credit_checkout_prime_j1', 'complete_checkout_prime_j1']
    if (!allowed.includes(name)) throw new Error('Unexpected RPC boundary: ' + name)
    state.rpcCalls.push({ name, args: structuredClone(args) })
    try {
      const entries = Object.entries(args)
      const sql = 'SELECT akasha_ai.' + identifier(name) + '(' + entries
        .map(([key], i) => identifier(key) + ' => $' + (i + 1)).join(', ') + ') AS receipt'
      const result = await db.query<{ receipt: Values }>(sql, entries
        .map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value))
      return { data: result.rows[0]?.receipt ?? null, error: null }
    } catch (error) { return failure(error) }
  }
  return { from, rpc, state }
}
