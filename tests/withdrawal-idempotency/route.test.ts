import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { NextRequest } from 'next/server'
import { USER, OTHER, KEY, SECOND_KEY, bridge, database, reserveArgs, reset, snapshot } from './fixture'

const mocks = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
  userId: '00000000-0000-4000-8000-000000000001',
  metadata: {} as Record<string, unknown>,
  profileError: false,
  balancePause: null as null | (() => Promise<void>),
  createTransfer: vi.fn(),
  connect: vi.fn(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null }, error: null }) },
}) }))
vi.mock('@/lib/supabase-public', () => ({ createPublicServiceClient: () => mocks.client }))
vi.mock('@/lib/stripe/connect', () => ({
  getConnectAccountRow: mocks.connect, getStripe: () => ({ transfers: { create: mocks.createTransfer } }),
}))
import { POST } from '../../src/app/api/connect/withdraw/route'

describe('Real withdrawal HTTP route with real journal SQL', () => {
  let db: PGlite
  beforeAll(async () => { db = await database() })
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs() })
  beforeEach(async () => {
    await reset(db); mocks.userId = USER; mocks.metadata = {}; mocks.profileError = false; mocks.balancePause = null
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_withdrawal_no_network')
    mocks.connect.mockReset().mockResolvedValue({ stripe_account_id: 'acct_synthetic', payouts_enabled: true })
    mocks.createTransfer.mockReset().mockImplementation(async params => ({
      id: 'tr_synthetic', object: 'transfer', amount: params.amount, currency: params.currency,
      amount_reversed: 0, reversed: false, destination: params.destination, livemode: false,
      metadata: params.metadata,
    }))
    const real = bridge(db)
    mocks.client = {
      async rpc(name: string, args: Record<string, unknown>) {
        if (name === 'get_wallet_balance_akasha') {
          if (mocks.balancePause) await mocks.balancePause()
          await db.exec('RESET ROLE')
          const value = await db.query<{ balance: string }>('SELECT wallet_balance AS balance FROM akasha_ai.profiles WHERE id=$1', [args.p_user_id])
          await db.exec('SET ROLE service_role')
          return { data: value.rows[0]?.balance ?? null, error: null }
        }
        return real.rpc(name, args)
      },
      from(table: string) {
        let columns = ''
        const response = () => table === 'profiles'
          ? { data: { id: USER, phone_verified: true, kyc_status: 'verified', device_id: null,
            metadata: mocks.metadata }, error: mocks.profileError ? { message: 'profile unavailable' } : null }
          : columns === 'id' ? { data: null, count: 0, error: null } : { data: [], error: null }
        const chain = {
          select(value: string) { columns = value; return chain },
          eq() { return chain }, neq() { return chain }, not() { return chain }, update() { return chain },
          single() { return Promise.resolve(response()) },
          then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve(response()).then(resolve, reject)
          },
        }
        return chain
      },
    }
  })
  const post = (body: Record<string, unknown> = { amount_eur: 20, idempotency_key: KEY, owner_id: USER }) =>
    POST(new NextRequest('http://localhost/api/connect/withdraw', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

  it('rejects an account switch before any debit or provider call', async () => {
    const result = await post({ amount_eur: 20, idempotency_key: KEY, owner_id: OTHER })
    expect(result.status).toBe(409); expect(mocks.createTransfer).not.toHaveBeenCalled()
    expect((await snapshot(db)).requests).toHaveLength(0)
  })
  it('replays a full balance request at zero without another provider call', async () => {
    await reset(db, 20)
    const body = { idempotency_key: KEY, owner_id: USER }
    expect((await post(body)).status).toBe(200)
    const replay = await post(body)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ amount_eur: 20, operation_state: 'completed', replayed: true })
    expect(mocks.createTransfer).toHaveBeenCalledTimes(1)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('0.00')
  })
  it('rejects a stored collusion freeze before admitting a new withdrawal', async () => {
    mocks.metadata = { collusion_flag: true }
    const result = await post()
    expect(result.status).toBe(403); expect(await result.json()).toMatchObject({ code: 'fraud_frozen' })
    expect(mocks.createTransfer).not.toHaveBeenCalled()
    expect((await snapshot(db)).requests).toHaveLength(0)
  })
  it('does not resume a reserved request after a persistent freeze', async () => {
    await bridge(db).rpc('reserve_akasha_withdrawal', reserveArgs())
    mocks.metadata = { collusion_flag: true }
    const result = await post()
    expect(result.status).toBe(403); expect(mocks.createTransfer).not.toHaveBeenCalled()
    const state = await snapshot(db)
    expect(state.requests[0].state).toBe('reserved'); expect(state.balances[0].wallet_balance).toBe('80.00')
  })
  it('does not resume a reservation to a newly changed Connect account', async () => {
    await bridge(db).rpc('reserve_akasha_withdrawal', reserveArgs())
    mocks.connect.mockResolvedValue({ stripe_account_id: 'acct_changed', payouts_enabled: true })
    expect((await post()).status).toBe(409)
    expect(mocks.createTransfer).not.toHaveBeenCalled()
  })
  it('does not turn a profile or Connect read error into approval', async () => {
    mocks.profileError = true
    expect((await post()).status).toBe(503)
    mocks.profileError = false; mocks.connect.mockRejectedValue(new Error('database unavailable'))
    expect((await post()).status).toBe(500)
    expect(mocks.createTransfer).not.toHaveBeenCalled()
    expect((await snapshot(db)).requests).toHaveLength(0)
  })
  it('a different UUID receives the active intent before a depleted balance blocks recovery', async () => {
    await reset(db, 20)
    await bridge(db).rpc('reserve_akasha_withdrawal', reserveArgs())
    const result = await post({ amount_eur: 20, idempotency_key: SECOND_KEY, owner_id: USER })
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ supersedes_request_key: SECOND_KEY,
      active_request: { owner_id: USER, request_key: KEY, amount_eur: 20 } })
    expect(mocks.createTransfer).not.toHaveBeenCalled()
  })
  it('a concurrent completed replay wins over a stale balance preflight', async () => {
    await reset(db, 20)
    let release!: () => void
    let entered!: () => void
    const reached = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    let first = true
    mocks.balancePause = async () => { if (first) { first = false; entered(); await barrier } }
    const waiting = post()
    await reached
    const successful = await post()
    expect(successful.status).toBe(200)
    release()
    const replay = await waiting
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ operation_state: 'completed', request_key: KEY })
    expect(mocks.createTransfer).toHaveBeenCalledTimes(1)
    expect((await snapshot(db)).balances[0].wallet_balance).toBe('0.00')
  })
  it('allows a refused 100-euro intention to be cancelled durably before admitting a new 20-euro intention', async () => {
    const refused = { amount_eur: 100, idempotency_key: KEY, owner_id: USER }
    expect((await post(refused)).status).toBe(403)
    expect((await snapshot(db)).requests).toHaveLength(0)
    const cancelled = await post({ ...refused, action: 'cancel' })
    expect(cancelled.status).toBe(200)
    expect(await cancelled.json()).toMatchObject({ cancellation_confirmed: true, request_key: KEY })
    expect((await post({ ...refused, amount_eur: 20 })).status).toBe(409)
    const next = await post({ ...refused, amount_eur: 20, idempotency_key: SECOND_KEY })
    expect(next.status).toBe(200); expect(mocks.createTransfer).toHaveBeenCalledTimes(1)
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('80.00'); expect(state.requests).toHaveLength(1)
  })
  it('a durable cancellation wins over an older POST paused before admission', async () => {
    let release!: () => void
    let entered!: () => void
    const reached = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    mocks.balancePause = async () => { entered(); await barrier }
    const older = post()
    await reached
    const cancellation = await post({ action: 'cancel', amount_eur: 20, idempotency_key: KEY, owner_id: USER })
    expect(cancellation.status).toBe(200)
    expect(await cancellation.json()).toMatchObject({ cancellation_confirmed: true })
    release()
    const late = await older
    expect(late.status).toBe(409)
    expect(await late.json()).toMatchObject({ code: 'withdrawal_request_cancelled' })
    expect(mocks.createTransfer).not.toHaveBeenCalled()
    const state = await snapshot(db)
    expect(state.balances[0].wallet_balance).toBe('100.00'); expect(state.requests).toHaveLength(0)
  })
})
