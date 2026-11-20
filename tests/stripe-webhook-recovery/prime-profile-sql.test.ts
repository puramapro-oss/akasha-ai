import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { checkoutProfileIntentSha256 } from '../../src/lib/stripe/checkout-profile-intent'
import { createPrimeDatabase, primeSqlBridge, resetPrimeDatabase, PROFILE_MIGRATION,
  PRIME_MIGRATION, USER_ONE, type Values } from './prime-fixture'

const oldSignature = 'akasha_ai.credit_checkout_prime_j1(text,boolean,text,uuid,numeric,text,text)'
const signature = 'akasha_ai.complete_checkout_prime_j1(text,boolean,text,uuid,numeric,text,text,text,text,text,text)'
const defaults = { p_stripe_account_key: 'platform', p_livemode: false,
  p_checkout_session_id: 'cs_profile_sql', p_user_id: USER_ONE, p_amount: 25, p_currency: 'eur',
  p_promo_source: null, p_customer_id: 'cus_profile_sql', p_subscription_id: 'sub_profile_sql',
  p_plan: null, p_plan_tier: null }
let database: PGlite
let bridge: ReturnType<typeof primeSqlBridge>
beforeAll(async () => { database = await createPrimeDatabase() }, 15000)
beforeEach(async () => { await resetPrimeDatabase(database); bridge = primeSqlBridge(database) })
afterAll(async () => { await database?.close() })
const complete = (changes: Values = {}) => bridge.rpc('complete_checkout_prime_j1', { ...defaults, ...changes })

async function state() {
  await database.exec('RESET ROLE')
  try {
    return {
      profiles: (await database.query(`SELECT id, stripe_customer_id, stripe_subscription_id, plan, plan_tier,
        subscription_started_at::text FROM akasha_ai.profiles ORDER BY id`)).rows,
      wallets: (await database.query('SELECT user_id,balance,total_earned FROM akasha_ai.wallets ORDER BY user_id')).rows,
      transactions: (await database.query('SELECT id FROM akasha_ai.wallet_transactions ORDER BY id')).rows,
      receipts: (await database.query(`SELECT checkout_session_id,user_id,
        encode(profile_intent_v1_sha256,'hex') AS intent FROM akasha_ai.checkout_prime_j1_receipts
        ORDER BY checkout_session_id`)).rows,
    }
  } finally { await database.exec('SET ROLE service_role') }
}

for (const [name, changes] of [
  ['nullable pair', {}],
  ['delimiters', { p_customer_id: 'cus:;n;', p_subscription_id: 'sub;3:x', p_plan: 'plus', p_plan_tier: 'essential' }],
  ['UTF-8 bytes', { p_customer_id: 'cus_é😀', p_subscription_id: 'sub_中', p_plan: 'é', p_plan_tier: '😀' }],
] as const) {
  it('binds the same canonical v1 intention in Node and SQL: ' + name, async () => {
    const args = { ...defaults, ...changes }
    const result = await complete(changes)
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({ profile_intent_version: 1,
      profile_intent_sha256: checkoutProfileIntentSha256({ customerId: args.p_customer_id,
        subscriptionId: args.p_subscription_id, plan: args.p_plan, tier: args.p_plan_tier }) })
  })
}

it('preserves the current plan and tier when the Checkout has no complete metadata pair', async () => {
  await database.query("UPDATE akasha_ai.profiles SET plan='premium',plan_tier='advanced' WHERE id=$1", [USER_ONE])
  expect((await complete()).error).toBeNull()
  expect((await state()).profiles[0]).toMatchObject({ plan: 'premium', plan_tier: 'advanced' })
})

for (const changes of [{ p_plan: 'plus' }, { p_plan_tier: 'essential' }]) {
  it('rejects an incomplete raw RPC plan pair ' + JSON.stringify(changes), async () => {
    const before = await state()
    expect((await complete(changes)).error?.message).toContain('Invalid Checkout profile intention')
    expect(await state()).toEqual(before)
  })
}

it('performs no profile UPDATE at all for a confirmed replay', async () => {
  const first = await complete()
  expect(first.error).toBeNull()
  const before = await state()
  await database.exec(`RESET ROLE;
    CREATE FUNCTION akasha_ai.profile_no_replay() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'profile UPDATE must not run on replay'; END $$;
    CREATE TRIGGER profile_no_replay BEFORE UPDATE ON akasha_ai.profiles
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.profile_no_replay(); SET ROLE service_role;`)
  try {
    const replay = await complete()
    expect(replay.error).toBeNull()
    expect(replay.data).toEqual({ ...first.data, status: 'already_credited' })
    expect(await state()).toEqual(before)
  } finally {
    await database.exec(`RESET ROLE; DROP TRIGGER profile_no_replay ON akasha_ai.profiles;
      DROP FUNCTION akasha_ai.profile_no_replay(); SET ROLE service_role;`)
  }
})

it('does not adopt a financial receipt without the historical profile intention', async () => {
  await database.exec('RESET ROLE')
  const old = await bridge.rpc('credit_checkout_prime_j1', {
    p_stripe_account_key: defaults.p_stripe_account_key, p_livemode: false,
    p_checkout_session_id: defaults.p_checkout_session_id, p_user_id: USER_ONE,
    p_amount: 25, p_currency: 'eur', p_promo_source: null,
  })
  expect(old.error).toBeNull() // The owner retains access; application roles do not.
  const before = await state()
  expect(before.receipts).toEqual([{ checkout_session_id: defaults.p_checkout_session_id, user_id: USER_ONE, intent: null }])
  expect((await complete()).error?.message).toContain('Historical Checkout profile requires reconciliation')
  expect(await state()).toEqual(before)
})

for (const [target, body] of [
  ['checkout_prime_j1_receipts', "RAISE EXCEPTION 'inert late receipt proof failure';"],
  ['profiles', "NEW.stripe_subscription_id := 'sub_rewritten_by_trigger'; RETURN NEW;"],
] as const) {
  it('rolls back every write when the late completion proof fails in ' + target, async () => {
    const before = await state()
    await database.exec(`RESET ROLE;
      CREATE FUNCTION akasha_ai.profile_proof_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN ${body} END $$;
      CREATE TRIGGER profile_proof_failure BEFORE UPDATE ON akasha_ai.${target}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.profile_proof_failure(); SET ROLE service_role;`)
    try {
      expect((await complete()).error).not.toBeNull()
      expect(await state()).toEqual(before)
    } finally {
      await database.exec(`RESET ROLE; DROP TRIGGER profile_proof_failure ON akasha_ai.${target};
        DROP FUNCTION akasha_ai.profile_proof_failure(); SET ROLE service_role;`)
    }
  })
}

it('requires a real beneficiary profile before creating any financial state', async () => {
  await database.exec('RESET ROLE')
  await database.query('DELETE FROM auth.users WHERE id=$1', [USER_ONE])
  const before = await state()
  expect((await complete()).error).not.toBeNull()
  expect(await state()).toEqual(before)
})

for (const role of ['anon', 'authenticated', 'service_role']) {
  it('closes the old financial entry point for ' + role + ' and admits only service completion', async () => {
    await database.exec('RESET ROLE; GRANT USAGE ON SCHEMA akasha_ai TO ' + role)
    const rights = await database.query<{ old_allowed: boolean; completion_allowed: boolean }>(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS old_allowed, has_function_privilege($1,$3,'EXECUTE') AS completion_allowed",
      [role, oldSignature, signature])
    expect(rights.rows[0]).toEqual({ old_allowed: false, completion_allowed: role === 'service_role' })
    await database.exec('SET ROLE ' + role)
    const old = await bridge.rpc('credit_checkout_prime_j1', {
      p_stripe_account_key: 'platform', p_livemode: false, p_checkout_session_id: 'cs_old_forbidden',
      p_user_id: USER_ONE, p_amount: 25, p_currency: 'eur', p_promo_source: null,
    })
    expect(old.error?.message).toContain('permission denied')
    if (role === 'service_role') expect((await complete()).error).toBeNull()
    else expect((await complete()).error?.message).toContain('permission denied')
  })
}

it('orders the additive file after both published migrations and rejects a missing financial prerequisite', async () => {
  const files = readdirSync(dirname(PROFILE_MIGRATION)).filter(name => name.endsWith('.sql')).sort()
  expect(files.indexOf(basename(PROFILE_MIGRATION))).toBeGreaterThan(files.indexOf(basename(PRIME_MIGRATION)))
  expect(files.indexOf(basename(PROFILE_MIGRATION))).toBeGreaterThan(files.indexOf('20261111_stripe_webhook_journal.sql'))
  const fresh = new PGlite()
  try {
    await fresh.exec('CREATE SCHEMA akasha_ai')
    await expect(fresh.exec(readFileSync(PROFILE_MIGRATION, 'utf8')))
      .rejects.toMatchObject({ code: '55000', message: 'Install the atomic prime migration before profile completion' })
    await fresh.exec('ROLLBACK')
    expect((await fresh.query('SELECT to_regprocedure($1) AS installed', [signature])).rows).toEqual([{ installed: null }])
  } finally { await fresh.close() }
}, 15000)
