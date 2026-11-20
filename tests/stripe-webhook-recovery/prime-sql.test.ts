import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createPrimeDatabase, primeSqlBridge, resetPrimeDatabase, USER_ONE, USER_TWO, type Values } from './prime-fixture'

let database: PGlite
let bridge: ReturnType<typeof primeSqlBridge>
const signature = 'akasha_ai.complete_checkout_prime_j1(text,boolean,text,uuid,numeric,text,text,text,text,text,text)'
const defaults = {
  p_stripe_account_key: 'platform', p_livemode: false,
  p_checkout_session_id: 'cs_synthetic_sql_prime', p_user_id: USER_ONE,
  p_amount: 25, p_currency: 'eur', p_promo_source: null,
  p_customer_id: 'cus_synthetic_prime', p_subscription_id: 'sub_synthetic_prime', p_plan: null, p_plan_tier: null,
}

beforeAll(async () => { database = await createPrimeDatabase() }, 15000)
beforeEach(async () => { await resetPrimeDatabase(database); bridge = primeSqlBridge(database) })
afterAll(async () => { await database?.close() })
const credit = (changes: Values = {}) => bridge.rpc('complete_checkout_prime_j1', { ...defaults, ...changes })

async function totals() {
  await database.exec('RESET ROLE')
  try {
    return (await database.query(`SELECT
      (SELECT count(*)::integer FROM akasha_ai.wallet_transactions) AS transactions,
      (SELECT count(*)::integer FROM akasha_ai.checkout_prime_j1_receipts) AS receipts,
      coalesce(sum(balance), 0)::text AS balance, coalesce(sum(total_earned), 0)::text AS earned
      FROM akasha_ai.wallets`)).rows[0]
  } finally { await database.exec('SET ROLE service_role') }
}

describe('atomic prime SQL contract, in-process PostgreSQL only', () => {
  it('returns a complete immutable receipt and a matching duplicate without another credit', async () => {
    const first = await credit()
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ version: 1, status: 'credited', stripe_account_key: 'platform',
      livemode: false, checkout_session_id: defaults.p_checkout_session_id, user_id: USER_ONE,
      amount: 25, currency: 'eur', promo_source: null, balance_after: 25, total_earned_after: 25 })
    const duplicate = await credit()
    expect(duplicate.error).toBeNull()
    expect(duplicate.data).toEqual({ ...first.data, status: 'already_credited' })
    expect(await totals()).toEqual({ transactions: 1, receipts: 1, balance: '25.00', earned: '25.00' })
  })

  it('separates authenticated account and mode instead of acknowledging another namespace', async () => {
    for (const changes of [{}, { p_stripe_account_key: 'acct_synthetic_other' }, { p_livemode: true }]) {
      expect((await credit(changes)).data?.status).toBe('credited')
    }
    expect(await totals()).toEqual({ transactions: 3, receipts: 3, balance: '75.00', earned: '75.00' })
  })

  for (const [name, changes] of [
    ['beneficiary', { p_user_id: USER_TWO }], ['amount', { p_amount: 26 }],
    ['currency', { p_currency: 'usd' }], ['promotion', { p_promo_source: 'other-promotion' }],
  ] as const) {
    it('rejects conflicting ' + name + ' without creating another financial effect', async () => {
      expect((await credit()).error).toBeNull()
      expect((await credit(changes)).error).not.toBeNull()
      expect(await totals()).toEqual({ transactions: 1, receipts: 1, balance: '25.00', earned: '25.00' })
    })
  }

  for (const [name, changes] of [
    ['null mode', { p_livemode: null }], ['empty account', { p_stripe_account_key: '' }],
    ['empty Session', { p_checkout_session_id: '' }], ['null beneficiary', { p_user_id: null }],
    ['noncanonical amount', { p_amount: 26 }], ['noncanonical currency', { p_currency: 'usd' }],
  ] as const) {
    it('rejects ' + name + ' before any financial write', async () => {
      expect((await credit(changes)).error).not.toBeNull()
      expect(await totals()).toEqual({ transactions: 0, receipts: 0, balance: '0', earned: '0' })
    })
  }

  for (const target of ['wallets', 'checkout_prime_j1_receipts'] as const) {
    it('rolls back transaction, balance and receipt when ' + target + ' fails after transaction insertion', async () => {
      await database.query('INSERT INTO akasha_ai.wallets(user_id,balance,total_earned) VALUES ($1,17,40)', [USER_ONE])
      await database.exec(`RESET ROLE;
        CREATE FUNCTION akasha_ai.prime_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN RAISE EXCEPTION 'inert injected prime failure'; END $$;
        CREATE TRIGGER prime_fixture_failure BEFORE ${target === 'wallets' ? 'UPDATE' : 'INSERT'}
          ON akasha_ai.${target} FOR EACH ROW EXECUTE FUNCTION akasha_ai.prime_fixture_failure();
        SET ROLE service_role;`)
      try {
        const result = await credit()
        expect(result.error?.message).toContain('inert injected prime failure')
        expect(await totals()).toEqual({ transactions: 0, receipts: 0, balance: '17.00', earned: '40.00' })
      } finally {
        await database.exec(`RESET ROLE; DROP TRIGGER prime_fixture_failure ON akasha_ai.${target};
          DROP FUNCTION akasha_ai.prime_fixture_failure(); SET ROLE service_role;`)
      }
      // A database error before commit left no receipt or partial financial effect.
      expect((await credit()).error).toBeNull()
      expect(await totals()).toEqual({ transactions: 1, receipts: 1, balance: '42.00', earned: '65.00' })
    })
  }

  for (const owner of [USER_ONE, USER_TWO]) {
    it('keeps unreceipted legacy history ambiguous for beneficiary ' + owner, async () => {
      const wallet = await database.query<{ id: string }>('INSERT INTO akasha_ai.wallets(user_id) VALUES ($1) RETURNING id', [owner])
      await database.query(`INSERT INTO akasha_ai.wallet_transactions(wallet_id,amount,type,description)
        VALUES ($1,25,'prime_j1',$2)`, [wallet.rows[0].id, 'Prime J+1 Purama (session ' + defaults.p_checkout_session_id + ')'])
      expect((await credit()).error?.message).toContain('requires reconciliation')
      expect(await totals()).toEqual({ transactions: 1, receipts: 0, balance: '0.00', earned: '0.00' })
    })
  }

  it('preserves the durable receipt when a descriptive transaction or wallet is removed', async () => {
    const first = await credit()
    expect(first.error).toBeNull()
    await database.query('DELETE FROM akasha_ai.wallets WHERE user_id=$1', [USER_ONE])
    const duplicate = await credit()
    expect(duplicate.error).toBeNull()
    expect(duplicate.data).toEqual({ ...first.data, status: 'already_credited' })
    expect(await totals()).toEqual({ transactions: 0, receipts: 1, balance: '0', earned: '0' })
  })

  it('allows account deletion while preserving a detached consumed-Session receipt', async () => {
    expect((await credit()).error).toBeNull()
    await database.exec('RESET ROLE')
    await database.query('DELETE FROM auth.users WHERE id=$1', [USER_ONE])
    expect((await database.query('SELECT user_id FROM akasha_ai.checkout_prime_j1_receipts')).rows)
      .toEqual([{ user_id: null }])
    expect(await totals()).toEqual({ transactions: 0, receipts: 1, balance: '0', earned: '0' })
    expect((await credit({ p_user_id: USER_TWO })).error?.message).toContain('Conflicting Checkout prime evidence')
    expect(await totals()).toEqual({ transactions: 0, receipts: 1, balance: '0', earned: '0' })
  })

  for (const role of ['anon', 'authenticated']) {
    it('denies the prime RPC to ' + role + ' even with schema usage', async () => {
      await database.exec('RESET ROLE; GRANT USAGE ON SCHEMA akasha_ai TO ' + role)
      expect((await database.query<{ allowed: boolean }>(
        'SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])).rows[0].allowed).toBe(false)
      await database.exec('SET ROLE ' + role)
      expect((await credit()).error?.message).toContain('permission denied')
    })
  }

  for (const role of ['anon', 'authenticated', 'service_role']) {
    it('denies direct receipt access and mutation to ' + role, async () => {
      await database.exec('RESET ROLE; GRANT USAGE ON SCHEMA akasha_ai TO ' + role)
      const permission = await database.query<{ allowed: boolean }>(
        "SELECT has_table_privilege($1,'akasha_ai.checkout_prime_j1_receipts','SELECT,INSERT,UPDATE,DELETE') AS allowed", [role])
      expect(permission.rows[0].allowed).toBe(false)
      await database.exec('SET ROLE ' + role)
      await expect(database.query('SELECT * FROM akasha_ai.checkout_prime_j1_receipts')).rejects.toMatchObject({ code: '42501' })
      await expect(database.query('DELETE FROM akasha_ai.checkout_prime_j1_receipts')).rejects.toMatchObject({ code: '42501' })
      await expect(database.query('UPDATE akasha_ai.checkout_prime_j1_receipts SET amount=25')).rejects.toMatchObject({ code: '42501' })
    })
  }
})
