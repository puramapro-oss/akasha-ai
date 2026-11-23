import { Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER = '33333333-3333-4333-8333-333333333333'
const FOREIGN = '55555555-5555-4555-8555-555555555555'
type Call = { method: string; url: URL; headers: Headers; body: Record<string, unknown> | null }
const calls: Call[] = []
let gifts: Record<string, unknown>[]
let streak: number
let authStatus: number
const receipt = (overrides: Record<string, unknown> = {}) => ({
  id: '44444444-4444-4444-8444-444444444444', user_id: USER, gift_type: 'points', gift_value: '10',
  streak_count: 0, gift_date: '2026-11-22', opened_at: '2026-11-22T23:59:59.999Z',
  fulfilled_at: '2026-11-22T23:59:59.999Z', delivery_status: 'delivered', ...overrides,
})
const json = (data: unknown, status = 200) => Response.json(data, { status })
beforeEach(() => {
  vi.resetModules(); calls.length = 0; gifts = []; streak = 0; authStatus = 200
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T23:59:59.999Z'))
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://gift-supabase.example.invalid')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  vi.spyOn(Math, 'random').mockReturnValue(.8)
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access forbidden') })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== 'https://gift-supabase.example.invalid') throw new Error('Unexpected network destination')
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Call['body'] : null
    calls.push({ method, url, headers, body })
    if (url.pathname === '/auth/v1/user') return json(authStatus === 200 ? {
      id: USER, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid',
      app_metadata: {}, user_metadata: {},
    } : { message: 'Synthetic session denied' }, authStatus)
    if (url.pathname === '/rest/v1/streaks') return json([{ current_streak: streak }])
    if (url.pathname === '/rest/v1/daily_gifts' && method === 'GET') {
      const union = url.searchParams.get('or')
      const selected = gifts.filter(gift => union
        ? gift.gift_date === '2026-11-22' || String(gift.opened_at) >= '2026-11-22T00:00:00.000Z'
          && String(gift.opened_at) < '2026-11-23T00:00:00.000Z'
        : String(gift.opened_at) >= '2026-11-22T00:00:00.000Z'
          && String(gift.opened_at) < '2026-11-23T00:00:00.000Z')
      const limit = Number(url.searchParams.get('limit')) || selected.length
      return json(selected.slice(0, limit))
    }
    if (url.pathname === '/rest/v1/rpc/claim_daily_gift' && method === 'POST') return json({
      gift: receipt({ gift_type: body?.p_gift_type, gift_value: String(body?.p_gift_value), streak_count: body?.p_streak_count }),
      replayed: false,
    })
    throw new Error('Unexpected PostgREST operation')
  }))
})
afterEach(() => {
  try { expect(Socket.prototype.connect).not.toHaveBeenCalled() }
  finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() }
})
async function run(method: 'GET' | 'POST' = 'GET', authorization = 'Bearer synthetic-user-token') {
  const route = await import('./route')
  return route[method](new Request('https://example.invalid/api/daily-gift', { method,
    headers: { authorization }, ...(method === 'POST' ? {
      body: JSON.stringify({ user_id: FOREIGN, gift_type: 'coupon', gift_value: '99999' }),
    } : {}),
  }))
}

describe('daily gift HTTP composition with the real Supabase SDK', () => {
  it('keeps the service schema, authenticated beneficiary and integer RPC contract', async () => {
    expect((await run('POST')).status).toBe(200)
    const writes = calls.filter(call => call.method !== 'GET')
    expect(writes).toHaveLength(1)
    expect(writes[0].url.pathname).toBe('/rest/v1/rpc/claim_daily_gift')
    expect(writes[0].headers.get('content-profile')).toBe('akasha_ai')
    expect(writes[0].headers.get('authorization')).toBe('Bearer synthetic-service-key')
    expect(writes[0].body).toEqual({ p_user_id: USER, p_gift_type: 'points', p_gift_value: 17, p_streak_count: 0 })
  })

  it('recovers the confirmed legacy date receipt using the same day union as the RPC', async () => {
    gifts = [receipt({ opened_at: '2026-11-21T23:30:00.000Z' })]
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ already_opened: true, gift: { id: gifts[0].id, label: '+10 points' } })
    const lookup = calls.find(call => call.url.pathname.endsWith('/daily_gifts'))!
    expect(lookup.url.searchParams.get('or')).toBe('(gift_date.eq.2026-11-22,and(opened_at.gte.2026-11-22T00:00:00.000Z,opened_at.lt.2026-11-23T00:00:00.000Z))')
    expect(lookup.url.searchParams.get('user_id')).toBe(`eq.${USER}`)
    expect(lookup.url.searchParams.get('limit')).toBe('2')
    expect(calls.every(call => call.method === 'GET')).toBe(true)
  })

  it('reports an ambiguous historical union instead of choosing a receipt or claiming an empty chest', async () => {
    gifts = [receipt({ opened_at: '2026-11-21T23:30:00.000Z' }),
      receipt({ id: '66666666-6666-4666-8666-666666666666', gift_date: '2026-11-23' })]
    expect((await run()).status).toBe(409)
    expect(calls.every(call => call.method === 'GET')).toBe(true)
  })

  it('keeps an unconfirmed legacy date receipt in reconciliation', async () => {
    gifts = [receipt({ opened_at: '2026-11-21T23:30:00.000Z', fulfilled_at: null, delivery_status: null })]
    expect((await run()).status).toBe(409)
  })

  it('refuses an unexpected foreign receipt without exposing it in the response', async () => {
    gifts = [receipt({ user_id: FOREIGN })]
    const response = await run()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain(FOREIGN)
  })

  it.each([-1, 1.5])('does not display an invalid server streak as a usable draw input: %s', async invalid => {
    streak = invalid
    expect((await run()).status).toBe(503)
    expect(calls.every(call => call.method === 'GET')).toBe(true)
  })

  it('rejects an invalid GET session before any database request', async () => {
    authStatus = 401
    expect((await run()).status).toBe(401)
    expect(calls.map(call => call.url.pathname)).toEqual(['/auth/v1/user'])
  })

  it('rejects an empty Bearer token before even querying authentication', async () => {
    expect((await run('GET', 'Bearer ')).status).toBe(401)
    expect(calls).toHaveLength(0)
  })
})
