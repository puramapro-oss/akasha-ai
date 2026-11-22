import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHOP_ITEMS } from './shop-catalog'

const doubles = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn(), rpc: vi.fn(), browserRpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: doubles.auth }, rpc: doubles.browserRpc }) }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.service }))
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REQUEST = '00000000-0000-4000-8000-000000000001'
const body = (item_id = 'credits-10', cost: unknown = 2000) => new NextRequest('http://localhost/api/points/redeem', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id, cost, request_id: REQUEST, expected_user_id: USER }),
})
beforeEach(() => {
  vi.clearAllMocks()
  doubles.auth.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  doubles.service.mockReturnValue({ rpc: doubles.rpc })
  doubles.rpc.mockImplementation(async (_name, args) => ({ data: {
    success: true, new_balance: 100, fulfilled: true, user_id: USER,
    request_id: args.p_request_id, item_id: args.p_item_id, cost_points: args.p_cost, purchase_id: 'synthetic-purchase',
  }, error: null }))
})
describe('redemption price and authenticated ownership', () => {
  it('requires an authenticated actor before constructing a privileged client', async () => {
    doubles.auth.mockResolvedValue({ data: { user: null }, error: null })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body())).status).toBe(401)
    expect(doubles.service).not.toHaveBeenCalled()
  })
  it('refuses an errored authentication result even if it contains a user object', async () => {
    doubles.auth.mockResolvedValue({ data: { user: { id: 'unverified-actor' } }, error: { message: 'expired' } })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body())).status).toBe(401)
    expect(doubles.service).not.toHaveBeenCalled()
  })
  it.each([undefined, null, 'invalid-actor'])('requires a valid intended actor before any privileged call: %j', async expected_user_id => {
    const request = new NextRequest('http://localhost/api/points/redeem', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: 'credits-10', cost: 2000, request_id: REQUEST, expected_user_id }) })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(request)).status).toBe(400)
    expect(doubles.service).not.toHaveBeenCalled()
    expect(doubles.rpc).not.toHaveBeenCalled()
  })
  it('refuses an old account intention when the request cookie now authenticates another account', async () => {
    doubles.auth.mockResolvedValue({ data: { user: { id: FOREIGN } }, error: null })
    const { POST } = await import('@/app/api/points/redeem/route')
    const response = await POST(body())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'La session a changé. Actualise la boutique avant de confirmer.' })
    expect(doubles.service).not.toHaveBeenCalled()
    expect(doubles.rpc).not.toHaveBeenCalled()
  })
  it.each([-1, 0, 0.5, 999.9, '1000', null])('rejects a non-integer/positive quote %j before any debit', async cost => {
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body('credits-10', cost))).status).toBe(400)
    expect(doubles.service).not.toHaveBeenCalled()
  })
  it.each([1, 999, 1001, 1000000])('rejects an altered quote %i against the shared catalogue', async cost => {
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body('credits-10', cost))).status).toBe(409)
    expect(doubles.service).not.toHaveBeenCalled()
  })
  it('rejects unknown articles without invoking a debit', async () => {
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body('unknown', 1000))).status).toBe(400)
    expect(doubles.service).not.toHaveBeenCalled()
  })
  it.each(SHOP_ITEMS)('uses the existing server catalogue price for $id', async item => {
    const { POST } = await import('@/app/api/points/redeem/route')
    const response = await POST(body(item.id, item.cost_points))
    if (!item.available) {
      expect(response.status).toBe(503)
      expect(doubles.service).not.toHaveBeenCalled()
      return
    }
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ user_id: USER })
    expect(doubles.rpc).toHaveBeenCalledExactlyOnceWith('redeem_points_reward', {
      p_user_id: USER, p_item_id: item.id, p_cost: item.cost_points, p_request_id: REQUEST,
    })
    expect(doubles.browserRpc).not.toHaveBeenCalled()
  })
  it.each([null, {}, [], { success: true }, { success: true, new_balance: -1 },
    { success: true, new_balance: 1.5 }])('refuses an invalid debit receipt %j', async data => {
    doubles.rpc.mockResolvedValue({ data, error: null })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body())).status).toBe(500)
  })
  it('does not hide a database error or a refused debit', async () => {
    const { POST } = await import('@/app/api/points/redeem/route')
    doubles.rpc.mockResolvedValue({ data: null, error: { message: 'synthetic error' } })
    expect((await POST(body())).status).toBe(500)
    doubles.rpc.mockResolvedValue({ data: [{ success: false, new_balance: null }], error: null })
    expect((await POST(body())).status).toBe(400)
  })
  it.each([['no_draw', 409], ['unavailable', 503], ['price_changed', 409]] as const)('refuses a reward unavailable at commit time: %s', async (reason, status) => {
    doubles.rpc.mockResolvedValue({ data: { success: false, reason }, error: null })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(body())).status).toBe(status)
  })
  it('rejects a missing replay key before any debit', async () => {
    const request = new NextRequest('http://localhost/api/points/redeem', { method: 'POST',
      body: JSON.stringify({ item_id: 'credits-10', cost: 2000, expected_user_id: USER }) })
    const { POST } = await import('@/app/api/points/redeem/route')
    expect((await POST(request)).status).toBe(400)
    expect(doubles.service).not.toHaveBeenCalled()
  })
})
