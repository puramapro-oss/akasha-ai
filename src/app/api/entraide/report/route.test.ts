import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Only application client factories are substituted. Auth, storage, PostgREST,
// route code, database helpers and the canonical moderation function are real.
// Every HTTP request terminates in the controlled fetch below; no server is used.
const factories = vi.hoisted(() => ({
  server: vi.fn(),
  service: vi.fn(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: factories.server }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: factories.service }))

import { POST } from './route'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = '22222222-2222-4222-8222-222222222222'
const TARGET = '33333333-3333-4333-8333-333333333333'
const PROVIDER_DETAIL = 'synthetic-private-database-detail'
const SERVICE_KEY = 'synthetic-service'
const STORAGE_KEY = 'entraide-report-controlled'
type Call = {
  path: string
  method: string
  authorization: string | null
  schema: string | null
  query: string
  values: Record<string, unknown> | null
}
const calls: Call[] = []
const unexpected: string[] = []
const storage = new Map<string, string>()
let insertError = false
let countError = false
let authUnavailable = false
let reportCount = 4
let tokenA = ''
let tokenB = ''

function user(id: string) {
  return {
    id, aud: 'authenticated', role: 'authenticated',
    app_metadata: {}, user_metadata: {}, identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  }
}
function token(id: string) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      sub: id, aud: 'authenticated', role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url'),
    'synthetic-signature',
  ].join('.')
}
const controlledFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const values = typeof init?.body === 'string'
    ? JSON.parse(init.body) as Record<string, unknown> : null
  calls.push({
    path: url.pathname, method, authorization: headers.get('authorization'),
    schema: headers.get('content-profile') ?? headers.get('accept-profile'),
    query: url.search, values,
  })
  if (url.origin !== 'https://supabase.invalid') {
    unexpected.push(method + ' ' + url.origin + url.pathname)
    return Response.json({ message: 'Unexpected destination rejected by fixture' }, { status: 599 })
  }
  if (url.pathname === '/auth/v1/user' && method === 'GET') {
    if (authUnavailable) return Response.json({ msg: 'Synthetic authentication unavailable' }, { status: 503 })
    const authorization = headers.get('authorization')
    if (authorization === 'Bearer ' + tokenA) return Response.json(user(A))
    if (authorization === 'Bearer ' + tokenB) return Response.json(user(B))
    return Response.json({ msg: 'Synthetic token rejected', error_code: 'bad_jwt' }, { status: 401 })
  }
  if (url.pathname === '/rest/v1/entraide_signalements' && method === 'POST') {
    if (insertError) {
      return Response.json({ code: '42501', message: PROVIDER_DETAIL }, { status: 403 })
    }
    return new Response(null, { status: 201 })
  }
  if (url.pathname === '/rest/v1/entraide_signalements' && method === 'HEAD') {
    if (countError) return new Response(null, { status: 403, statusText: 'Synthetic count refused' })
    return new Response(null, { status: 200, headers: { 'Content-Range': '0-0/' + reportCount } })
  }
  unexpected.push(method + ' ' + url.pathname)
  return Response.json({ message: 'Unexpected request rejected by fixture' }, { status: 599 })
}
function makeCookieClient() {
  return createSupabaseClient('https://supabase.invalid', 'synthetic-anon', {
    db: { schema: 'akasha_ai' },
    auth: {
      storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value) },
        removeItem: key => { storage.delete(key) },
      },
    },
    global: { fetch: controlledFetch },
  })
}
function makeServiceClient() {
  return createSupabaseClient('https://supabase.invalid', SERVICE_KEY, {
    db: { schema: 'akasha_ai' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: controlledFetch },
  })
}
let cookieClient: ReturnType<typeof makeCookieClient>
let serviceClient: ReturnType<typeof makeServiceClient>

function request(body: unknown = { target_id: TARGET, reason: 'Synthetic report regression' }, authorization: string | null = 'Bearer ' + tokenA) {
  return new NextRequest('http://localhost/api/entraide/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  })
}
const databaseCalls = () => calls.filter(call => call.path.startsWith('/rest/v1/'))
const inserted = () => databaseCalls().find(call => call.method === 'POST')

beforeEach(async () => {
  vi.clearAllMocks()
  storage.clear()
  calls.length = 0
  unexpected.length = 0
  insertError = false
  countError = false
  authUnavailable = false
  reportCount = 4
  tokenA = token(A)
  tokenB = token(B)
  storage.set(STORAGE_KEY, JSON.stringify({
    access_token: tokenB, refresh_token: 'synthetic-refresh-B', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(B),
  }))
  // An accidental use of a different fetch must fail locally, not reach a provider.
  vi.stubGlobal('fetch', vi.fn(async () => {
    unexpected.push('uncontrolled-global-fetch')
    throw new Error('Uncontrolled fetch rejected by fixture')
  }))
  cookieClient = makeCookieClient()
  serviceClient = makeServiceClient()
  factories.server.mockResolvedValue(cookieClient)
  factories.service.mockReturnValue(serviceClient)
  expect((await cookieClient.auth.getSession()).data.session?.user.id).toBe(B)
})

afterEach(() => {
  cookieClient?.auth.stopAutoRefresh()
  serviceClient?.auth.stopAutoRefresh()
  vi.unstubAllGlobals()
  expect(unexpected).toEqual([])
})

describe('report route with real Supabase SDK and controlled HTTP', () => {
  it('does not report success when PostgREST rejects the insert', async () => {
    insertError = true
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain(PROVIDER_DETAIL)
    expect(databaseCalls().map(call => call.method)).toEqual(['POST'])
  })

  it('does not turn a failed exact count into zero reports and a successful response', async () => {
    countError = true
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('success')
    expect(databaseCalls().map(call => call.method)).toEqual(['POST', 'HEAD'])
  })

  it('verifies bearer A and writes reporter A despite stored cookie B and forged body identity', async () => {
    const response = await POST(request({
      target_id: TARGET, reason: 'Synthetic report regression', reporter_id: B,
    }))
    expect(response.status).toBe(200)
    expect(inserted()?.values).toEqual({
      reporter_id: A, target_id: TARGET, reason: 'Synthetic report regression',
    })
    expect(calls.find(call => call.path === '/auth/v1/user')?.authorization).toBe('Bearer ' + tokenA)
    expect(databaseCalls().every(call => call.authorization === 'Bearer ' + SERVICE_KEY)).toBe(true)
    expect(databaseCalls().every(call => call.schema === 'akasha_ai')).toBe(true)
    expect((await cookieClient.auth.getSession()).data.session?.user.id).toBe(B)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('does not fall back to cookie B when an explicit bearer is rejected', async () => {
    const response = await POST(request(undefined, 'Bearer rejected-synthetic-token'))
    expect(response.status).toBe(401)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
    expect(calls.filter(call => call.path === '/auth/v1/user')).toHaveLength(1)
  })

  it('preserves verified cookie admission only when no authorization header is supplied', async () => {
    const response = await POST(request(undefined, null))
    expect(response.status).toBe(200)
    expect(inserted()?.values?.reporter_id).toBe(B)
    expect(await response.json()).toEqual({
      success: true, should_suspend: expect.any(Boolean), active_report_count: 4,
    })
    expect(calls.find(call => call.path === '/auth/v1/user')?.authorization).toBe('Bearer ' + tokenB)
  })

  it('checks self-reporting against verified A instead of the stored B identity', async () => {
    const response = await POST(request({ target_id: A, reason: 'Synthetic self report' }))
    expect(response.status).toBe(400)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
  })

  it('normalizes UUID case when rejecting a self-report', async () => {
    const response = await POST(request({ target_id: A.toUpperCase(), reason: 'Synthetic self report' }))
    expect(response.status).toBe(400)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
  })

  it('preserves a legitimate exact zero count', async () => {
    reportCount = 0
    const response = await POST(request(undefined, null))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true, should_suspend: expect.any(Boolean), active_report_count: 0,
    })
    const count = databaseCalls().find(call => call.method === 'HEAD')
    expect(count?.query).toContain('target_id=eq.' + TARGET)
  })

  it('rejects invalid report data before creating a privileged client', async () => {
    const response = await POST(request({ target_id: TARGET, reason: 'short' }))
    expect(response.status).toBe(400)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
  })

  it('returns unavailable when the authentication provider is unavailable', async () => {
    authUnavailable = true
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
  })

  it('rejects a missing cookie session when there is no explicit bearer', async () => {
    storage.clear()
    const response = await POST(request(undefined, null))
    expect(response.status).toBe(401)
    expect(factories.service).not.toHaveBeenCalled()
    expect(databaseCalls()).toEqual([])
  })
})
