import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ client: vi.fn(), auth: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: doubles.auth } }) }))
const USER = '00000000-0000-4000-8000-000000000001'
const request = (method = 'POST', authenticated = true) => new Request('http://localhost/api/daily-gift', {
  method, headers: authenticated ? { authorization: 'Bearer synthetic-token' } : {},
})
function fixture(options: { rpcError?: string; malformed?: boolean; readError?: boolean; legacy?: boolean; replayed?: boolean; pendingCoupon?: boolean } = {}) {
  const gift = { id: '00000000-0000-4000-8000-000000000011', user_id: USER,
    gift_type: options.pendingCoupon ? 'coupon' : 'points', gift_value: options.pendingCoupon ? '20' : '7', streak_count: 0, opened_at: '2026-11-22T12:00:00Z',
    fulfilled_at: options.legacy || options.pendingCoupon ? null : '2026-11-22T12:00:00Z',
    delivery_status: options.pendingCoupon ? 'pending_coupon_activation' : options.legacy ? null : 'delivered',
    delivery_details: options.pendingCoupon ? { code: 'DAILY20-example', valid_for_days: 3 } : null }
  const rpc = vi.fn().mockResolvedValue({ data: options.malformed ? null : { gift, streak: 0, replayed: !!options.replayed },
    error: options.rpcError ? { code: options.rpcError } : null })
  const inserts = vi.fn().mockResolvedValue({ data: gift, error: null })
  const ranges: string[] = []
  const chain = (table: string) => {
    const result = { data: table === 'streaks' ? { current_streak: 0 } : options.legacy || options.pendingCoupon ? gift : null,
      error: options.readError ? { code: 'XX000' } : null }
    const q = { select: () => q, eq: () => q, gte: () => q,
      or: (value: string) => { const end = /opened_at\.lt\.([^)]*)/.exec(value)?.[1]; if (end) ranges.push(end); return q },
      order: () => q, limit: () => q,
      lt: (_field: string, value: string) => { ranges.push(value); return q }, lte: () => q,
      single: async () => table === 'daily_gifts' ? { data: gift, error: null } : result,
      maybeSingle: async () => result, insert: (value: unknown) => { inserts(value); return q },
      update: () => q, then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === 'daily_gifts'
        ? { ...result, data: result.data ? [result.data] : [] } : result).then(resolve) }
    return q
  }
  doubles.client.mockReturnValue({ from: vi.fn(chain), rpc })
  return { rpc, inserts, ranges, gift }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
  doubles.auth.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  vi.spyOn(Math, 'random').mockReturnValue(.9)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('daily gift confirmation is one atomic delivery', () => {
  it('rejects a missing session before a service-role write', async () => {
    fixture(); const { POST } = await import('@/app/api/daily-gift/route')
    expect((await POST(request('POST', false))).status).toBe(401)
    expect(doubles.client).not.toHaveBeenCalled()
  })
  it('uses one transaction for the claim and reward instead of separate writes', async () => {
    const { rpc, inserts } = fixture(); const { POST } = await import('@/app/api/daily-gift/route')
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('claim_daily_gift', expect.objectContaining({ p_user_id: USER, p_gift_type: 'points' }))
    expect(inserts).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ gift: { gift_value: '7', label: '+7 points' } })
  })
  it.each(['XX000', '55000', '40001'])('does not report a failed or unavailable reward as delivered: %s', async rpcError => {
    fixture({ rpcError }); const { POST } = await import('@/app/api/daily-gift/route')
    expect((await POST(request())).status).toBe(503)
  })
  it('does not recredit a historical unqualified claim', async () => {
    fixture({ rpcError: 'P0002' }); const { POST } = await import('@/app/api/daily-gift/route')
    expect((await POST(request())).status).toBe(409)
  })
  it('returns the original confirmed reward on a response retry', async () => {
    fixture({ replayed: true }); const { POST } = await import('@/app/api/daily-gift/route')
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ replayed: true, gift: { gift_value: '7' } })
  })
  it('rejects a malformed delivery receipt', async () => {
    fixture({ malformed: true }); const { POST } = await import('@/app/api/daily-gift/route')
    expect((await POST(request())).status).toBe(503)
  })
  it('does not roll a new gift when its streak read fails', async () => {
    const { rpc, inserts } = fixture({ readError: true }); const { POST } = await import('@/app/api/daily-gift/route')
    expect((await POST(request())).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled(); expect(inserts).not.toHaveBeenCalled()
  })
  it('includes the last fractional second in the UTC gift day', async () => {
    const { ranges } = fixture(); const { GET } = await import('@/app/api/daily-gift/route')
    expect((await GET(request('GET'))).status).toBe(200)
    expect(ranges).toContain('2026-11-23T00:00:00.000Z')
  })
  it('does not turn a gift lookup error into an empty chest', async () => {
    fixture({ readError: true }); const { GET } = await import('@/app/api/daily-gift/route')
    expect((await GET(request('GET'))).status).toBe(503)
  })
  it('does not present a historical unconfirmed gift as delivered', async () => {
    fixture({ legacy: true }); const { GET } = await import('@/app/api/daily-gift/route')
    expect((await GET(request('GET'))).status).toBe(409)
  })
  it('distinguishes a registered coupon from an activated discount', async () => {
    fixture({ pendingCoupon: true }); const { POST, GET } = await import('@/app/api/daily-gift/route')
    const response = await POST(request())
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ gift: { fulfilled_at: null, delivery_status: 'pending_coupon_activation',
      delivery_details: { code: 'DAILY20-example' } } })
    const read = await GET(request('GET'))
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ already_opened: true, gift: { delivery_status: 'pending_coupon_activation' } })
  })
})
