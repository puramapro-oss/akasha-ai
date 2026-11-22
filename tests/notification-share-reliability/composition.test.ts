import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ exportClient: {} as Record<string, unknown> }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => mocks.exportClient }))
vi.mock('@purama/smarana', () => ({ smarana: { memory: {} } }))
import { GET as exportPersonalData } from '../../src/app/api/legal/my-data/route'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const KEY = '10000000-0000-4000-8000-000000000001'
const CANCELLED = '10000000-0000-4000-8000-000000000002'
const ATTEMPT = '20000000-0000-4000-8000-000000000001'
const REWARD = '30000000-0000-4000-8000-000000000001'
const HASH = 'a'.repeat(64)
const source = (path: string) => readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8')
const tables = ['profiles', 'social_shares', 'point_transactions', 'purama_points',
  'email_sequences', 'notification_preferences', 'point_shop_items', 'point_purchases',
  'lottery_draws', 'lottery_tickets', 'streaks', 'daily_gifts', 'user_coupons', 'contact_messages']
const migrations = [
  '20261122165000_delivery_consistency.sql',
  '20261122165100_daily_gift_delivery.sql',
  '20261122165200_points_redemption_authority.sql',
  '20261122165300_profile_write_boundary.sql',
  '20261122170000_akasha_withdrawal_idempotency.sql',
  '20261122170100_email_sequence_delivery.sql',
  '20261122170200_social_share_tracking_atomic.sql',
  '20261122170300_delivery_receipts_export.sql',
]
let db: PGlite
async function install(sql: string, label: string) {
  try { await db.exec(sql) }
  catch (cause) { throw new Error('Composition fixture failed at ' + label, { cause }) }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA akasha_ai;
    GRANT USAGE ON SCHEMA akasha_ai,auth TO anon,authenticated,service_role;`)
  const schema = source('schema.sql')
  for (const table of tables) {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS akasha_ai.' + table + ' (')
    const end = schema.indexOf('\n);', start)
    if (start < 0 || end < 0) throw new Error('Canonical composition table missing: ' + table)
    await install(schema.slice(start, end + 3), 'table ' + table)
    // Bootstrap existing broad grants; the actual migrations must narrow them.
    // Table definitions and ownership policies are extracted, not recreated here.
    await db.exec('GRANT ALL ON akasha_ai.' + table + ' TO authenticated,service_role;'
      + 'ALTER TABLE akasha_ai.' + table + ' ENABLE ROW LEVEL SECURITY;')
    const policies = [...schema.matchAll(new RegExp('CREATE POLICY \\w+ ON akasha_ai\\.' + table + '\\s[^;]+;', 'g'))]
    if (policies.length === 0) throw new Error('Canonical ownership policy missing: ' + table)
    for (const policy of policies) await install(policy[0], 'policy for ' + table)
  }
  // A table-level revoke must also remove older column-level balance grants.
  await db.exec('GRANT UPDATE(wallet_balance,credits,role) ON akasha_ai.profiles TO authenticated')
  await db.exec(source('tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql'))
  for (const migration of migrations) await install(source('supabase/migrations/' + migration), migration)
}, 15_000)

beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users,akasha_ai.lottery_draws CASCADE')
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [A, B])
  for (const [actor, code] of [[A, 'ref-a'], [B, 'ref-b']]) {
    await db.query('INSERT INTO akasha_ai.profiles(id,email,wallet_balance,referral_code) VALUES($1,$2,100,$3)',
      [actor, actor + '@example.invalid', code])
    await db.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,10000,10000)', [actor])
    await db.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,10000,'fixture')", [actor])
    await db.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [actor])
  }
  await asRole('service_role')
})
afterAll(async () => { await db?.close() })

async function asRole(role: 'service_role' | 'authenticated' | 'anon', actor = '') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor])
  await db.exec('SET ROLE ' + role)
}
async function json(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: Record<string, unknown> }>(sql, args)).rows[0].value
}
async function balances(actor = A) {
  return (await db.query<{ wallet: string; credits: number; points: number; ledger: number }>(`SELECT
    p.wallet_balance::text AS wallet,p.credits,q.balance AS points,
    (SELECT sum(amount)::integer FROM akasha_ai.point_transactions WHERE user_id=$1) AS ledger
    FROM akasha_ai.profiles p JOIN akasha_ai.purama_points q ON q.user_id=p.id WHERE p.id=$1`, [actor])).rows[0]
}
const reserve = (actor = A, key = KEY) => json(
  "SELECT public.reserve_akasha_withdrawal($1,$2,20,20,'acct_synthetic','test','{}',50) AS value", [actor, key])
const claim = (actor = A, key = KEY) => json(
  'SELECT public.claim_akasha_withdrawal($1,$2,$3) AS value', [actor, key, ATTEMPT])
const complete = (actor = A, key = KEY) => json(
  "SELECT public.complete_akasha_withdrawal($1,$2,$3,$4,20,'acct_synthetic','test') AS value",
  [actor, key, ATTEMPT, 'tr_composition' + actor.replaceAll('-', '')])
const cancel = (actor = A, key = CANCELLED) => json(
  'SELECT public.cancel_akasha_withdrawal($1,$2) AS value', [actor, key])
const reward = (actor = A) => json(
  "SELECT akasha_ai.redeem_points_reward($1,2000,'credits-10',$2) AS value", [actor, REWARD])
const gift = () => json("SELECT akasha_ai.claim_daily_gift($1,'credits',3,0) AS value", [A])

function exportClient(actor: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: actor, email: actor + '@example.invalid' } } }) },
    rpc(name: string) {
      if (name !== 'export_own_delivery_receipts') throw new Error('Unexpected export RPC: ' + name)
      return { abortSignal: async () => ({ data: await json('SELECT akasha_ai.export_own_delivery_receipts() AS value'), error: null }) }
    },
    from(table: string) {
      let column: 'id' | 'user_id' | null = null
      let value: unknown
      const read = async (single = false) => {
        // Unrelated export domains are outside this fixture. Every composition
        // table is read through its real SQL permissions and ownership policies.
        if (!tables.includes(table)) return { data: single ? null : [], error: null }
        const result = await db.query('SELECT * FROM akasha_ai.' + table
          + (column ? ' WHERE ' + column + '=$1' : ''), column ? [value] : [])
        return { data: single ? result.rows[0] ?? null : result.rows, error: null }
      }
      const chain = {
        select() { return chain },
        eq(field: string, input: unknown) {
          if (field !== 'id' && field !== 'user_id') throw new Error('Unexpected export owner column: ' + field)
          column = field; value = input; return chain
        },
        maybeSingle: () => read(true),
        then(resolve: (result: Awaited<ReturnType<typeof read>>) => unknown, reject?: (error: unknown) => unknown) {
          return read().then(resolve, reject)
        },
      }
      return chain
    },
  }
}

describe('Composition of the eight delivery migrations; in-memory SQL, no provider', () => {
  it('retains own settings and refuses privileged profile writes, including older column grants', async () => {
    await asRole('authenticated', A)
    for (const column of ['wallet_balance', 'credits', 'role', 'plan']) {
      await expect(db.query('UPDATE akasha_ai.profiles SET ' + column + '=' + column + ' WHERE id=$1', [A]))
        .rejects.toMatchObject({ code: '42501' })
    }
    expect((await db.query("UPDATE akasha_ai.profiles SET bio='Own setting' WHERE id=$1", [A])).affectedRows).toBe(1)
    expect((await db.query("UPDATE akasha_ai.profiles SET bio='Foreign setting' WHERE id=$1", [B])).affectedRows).toBe(0)
    await expect(db.query('DELETE FROM akasha_ai.profiles WHERE id=$1', [A])).rejects.toMatchObject({ code: '42501' })
    expect(await balances()).toEqual({ wallet: '100.00', credits: 0, points: 10000, ledger: 10000 })
  })

  it('composes gift credits, purchased credits and a euro withdrawal without mixing balances', async () => {
    expect(await reward()).toMatchObject({ fulfilled: true, new_balance: 8000 })
    const receivedGift = await gift()
    expect(receivedGift.gift).toMatchObject({ gift_type: 'credits', delivery_status: 'delivered' })
    expect(await balances()).toEqual({ wallet: '100.00', credits: 13, points: 8000, ledger: 8000 })
    await reserve(); expect(await claim()).toMatchObject({ send_authorized: true }); await complete()
    expect(await reward()).toMatchObject({ replayed: true, new_balance: 8000 })
    expect(await gift()).toEqual({ ...receivedGift, replayed: true })
    expect(await reserve()).toMatchObject({ state: 'completed' })
    expect(await balances()).toEqual({ wallet: '80.00', credits: 13, points: 8000, ledger: 8000 })
  })

  it('cancels an unadmitted key durably while allowing a separate new intention', async () => {
    const cancelled = await cancel()
    expect(cancelled).toMatchObject({ cancelled: true, user_id: A, request_key: CANCELLED })
    expect(await cancel()).toEqual(cancelled)
    await expect(reserve(A, CANCELLED)).rejects.toThrow('withdrawal_request_cancelled')
    expect(await balances()).toEqual({ wallet: '100.00', credits: 0, points: 10000, ledger: 10000 })
    await reserve(); await claim(); await complete()
    expect(await cancel()).toEqual(cancelled)
    await expect(reserve(A, CANCELLED)).rejects.toThrow('withdrawal_request_cancelled')
    expect(await balances()).toEqual({ wallet: '80.00', credits: 0, points: 10000, ledger: 10000 })
  })

  it('preserves one debit and one claim through admission and completion replays', async () => {
    const reserved = await reserve(); expect(await reserve()).toEqual(reserved)
    expect(await claim()).toMatchObject({ send_authorized: true })
    expect(await claim()).toMatchObject({ send_authorized: false })
    const completed = await complete(); expect(await complete()).toEqual(completed)
    expect(completed).toMatchObject({ state: 'completed', new_balance_eur: 80 })
    expect(await balances()).toEqual({ wallet: '80.00', credits: 0, points: 10000, ledger: 10000 })
  })

  it('restores a proven failed withdrawal once without changing purchased credits or points', async () => {
    await reward(); await reserve(); await claim()
    const reject = () => json("SELECT public.reject_akasha_withdrawal($1,$2,$3,'balance_insufficient') AS value",
      [A, KEY, ATTEMPT])
    const rejected = await reject(); expect(await reject()).toEqual(rejected)
    expect(rejected).toMatchObject({ state: 'rejected', restored_balance_eur: 100 })
    expect(await balances()).toEqual({ wallet: '100.00', credits: 10, points: 8000, ledger: 8000 })
  })

  it('persists contact through the service role without exposing messages to another authenticated user', async () => {
    const saved = await db.query<{ id: string }>(`INSERT INTO akasha_ai.contact_messages(name,email,subject,message)
      VALUES('Synthetic','a@example.invalid','Composition','No provider') RETURNING id`)
    expect(saved.rows[0].id).toMatch(/^[0-9a-f-]{36}$/)
    await asRole('authenticated', B)
    expect((await db.query('SELECT * FROM akasha_ai.contact_messages')).rows).toHaveLength(0)
  })

  it('exports only the current owner’s private receipts and separately readable purchase receipt', async () => {
    for (const actor of [A, B]) {
      await reward(actor); await cancel(actor); await reserve(actor); await claim(actor); await complete(actor)
      await json('SELECT akasha_ai.claim_email_sequence_delivery($1,$2,$3,$4,$5) AS value',
        [actor, 'welcome', ATTEMPT, HASH, actor + '@example.invalid'])
    }
    for (const actor of [A, B]) {
      await asRole('authenticated', actor)
      const exported = await json('SELECT akasha_ai.export_own_delivery_receipts() AS value')
      expect(exported).toMatchObject({ version: 1, user_id: actor })
      expect(exported.emails).toHaveLength(1)
      expect(exported.withdrawals).toHaveLength(1)
      expect(exported.withdrawal_cancellations).toHaveLength(1)
      const purchases = await db.query<{ user_id: string; item_code: string; points_spent: number;
        fulfillment_type: string; fulfillment_value: number }>(
        'SELECT user_id,item_code,points_spent,fulfillment_type,fulfillment_value FROM akasha_ai.point_purchases')
      expect(purchases.rows).toEqual([{ user_id: actor, item_code: 'credits-10', points_spent: 2000,
        fulfillment_type: 'credits', fulfillment_value: 10 }])
      mocks.exportClient = exportClient(actor)
      const response = await exportPersonalData()
      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.point_purchases).toHaveLength(1)
      expect(payload.point_purchases[0]).toMatchObject(purchases.rows[0])
      expect(payload.recus_operations).toMatchObject({ disponible: true,
        retraits: exported.withdrawals, annulations_retrait: exported.withdrawal_cancellations })
      const text = JSON.stringify(exported)
      for (const hidden of ['request_key', 'attempt_token', 'fraud_metadata', HASH, actor === A ? B : A]) {
        expect(text).not.toContain(hidden)
      }
      for (const table of ['withdrawal_requests', 'withdrawal_cancellations', 'email_sequence_deliveries']) {
        await expect(db.query('SELECT * FROM akasha_ai.' + table)).rejects.toMatchObject({ code: '42501' })
      }
    }
  })

  it('keeps the private export closed to anonymous and signed-out callers', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await asRole(role)
      await expect(db.query('SELECT akasha_ai.export_own_delivery_receipts()')).rejects.toMatchObject({ code: '42501' })
    }
  })
})
