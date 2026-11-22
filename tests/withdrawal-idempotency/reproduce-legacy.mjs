import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stdout } from 'node:process'

// Historical evidence only. The exact original migration is executed solely in
// an ephemeral in-memory database with synthetic users. No provider is contacted.
const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const legacyPath = 'migrations/v4.1-akasha-withdrawals.sql'
const legacy = source(legacyPath)
const schema = source('schema.sql')
const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.profiles (')
const end = schema.indexOf('\n);', start)
if (start < 0 || end < 0) throw new Error('Canonical profile schema unavailable')
const users = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
const db = new PGlite()
try {
  await db.exec('CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth;'
    + 'CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE SCHEMA akasha_ai;')
  await db.exec(schema.slice(start, end + 3))
  await db.exec(legacy)
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', users)
  await db.query('INSERT INTO akasha_ai.profiles(id,wallet_balance) VALUES ($1,100),($2,100)', users)
  await db.exec('SET ROLE service_role')
  const call = async (name, user) => (await db.query(
    'SELECT public.' + name + '($1,20) AS balance', [user],
  )).rows[0].balance
  const debit = 'debit_wallet_for_withdrawal_akasha'
  const credit = 'credit_wallet_on_withdrawal_failure_akasha'
  const duplicateDebit = [100, await call(debit, users[0]), await call(debit, users[0])]
  const duplicateCompensation = [100, await call(debit, users[1]),
    await call(credit, users[1]), await call(credit, users[1])]
  if (Number(duplicateDebit.at(-1)) !== 60 || Number(duplicateCompensation.at(-1)) !== 120) {
    throw new Error('Historical reproduction changed; inspect the canonical SQL before interpreting it')
  }
  stdout.write(JSON.stringify({ scope: 'synthetic PGlite memory only', source: legacyPath,
    source_sha256: createHash('sha256').update(legacy).digest('hex'),
    duplicate_debit_balances: duplicateDebit,
    duplicate_compensation_balances: duplicateCompensation,
    conclusion: 'Neither legacy RPC binds its mutation to an operation key.',
  }, null, 2) + '\n')
} finally { await db.close() }
