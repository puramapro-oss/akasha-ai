import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const factories = vi.hoisted(() => ({ server: vi.fn(), service: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: factories.server }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: factories.service }))
import { POST as contact } from '@/app/api/entraide/contacts/route'
import { POST as report } from '@/app/api/entraide/report/route'
import { getBlockedUserIds, getContactRequestsSentToday, getActiveReportCount } from './entraide'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REQUEST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const DETAIL = 'synthetic-private-database-detail'
const STORAGE = 'contacts-counts-controlled'
const peer = (n: number) => 'dddddddd-dddd-4ddd-8ddd-' + String(n).padStart(12, '0')
type Block = { blocker_id: string; blocked_id: string }
type Page = { rows: unknown; count: string | null }
type Call = { url: URL; method: string; headers: Headers; values: Record<string, unknown> | null }
const calls: Call[] = []
const unexpected: string[] = []
const storage = new Map<string, string>()
let blocks: Block[] = []
let blockCap = 1000
let alterPage: ((page: Page) => Page) | null = null
let quotaCount: string | null = '0'
let reportCount: string | null = '4'
let deniedTable: string | null = null
let actorId = A
let tokenA = ''
let tokenC = ''
function user(id: string) {
  return { id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
    identities: [], created_at: '2026-01-01T00:00:00.000Z' }
}
function token(id: string) {
  return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic-signature'].join('.')
}
function countHeaders(count: string | null): Record<string, string> {
  return count === null ? {} : { 'Content-Range': '*/' + count }
}
function eq(url: URL, column: string, value: string) {
  const filter = url.searchParams.get(column)
  return filter === null || filter.toLowerCase() === 'eq.' + value.toLowerCase()
}
const controlledFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const text = ['POST', 'PATCH'].includes(request.method) ? await request.text() : ''
  const values = text ? JSON.parse(text) as Record<string, unknown> : null
  calls.push({ url, method: request.method, headers: request.headers, values })
  const refuse = () => {
    unexpected.push(request.method + ' ' + url.origin + url.pathname)
    return Response.json({ message: 'Unexpected request rejected locally' }, { status: 403 })
  }
  if (url.origin !== 'https://supabase.invalid') return refuse()
  if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
    const authorization = request.headers.get('authorization')
    if (authorization === 'Bearer ' + tokenA) return Response.json(user(actorId))
    if (authorization === 'Bearer ' + tokenC) return Response.json(user(C))
    return Response.json({ msg: 'Synthetic token rejected', error_code: 'bad_jwt' }, { status: 401 })
  }
  const schema = request.headers.get('content-profile') ?? request.headers.get('accept-profile')
  if (request.headers.get('authorization') !== 'Bearer synthetic-service' || schema !== 'akasha_ai') return refuse()
  if (url.pathname === '/rest/v1/' + deniedTable) {
    return Response.json({ code: '42501', message: DETAIL }, { status: 403 })
  }
  const exact = request.headers.get('prefer')?.includes('count=exact')
  if (url.pathname === '/rest/v1/entraide_blocages' && request.method === 'GET') {
    const selected = blocks.filter(row => eq(url, 'blocker_id', row.blocker_id) && eq(url, 'blocked_id', row.blocked_id))
    const limit = Number(url.searchParams.get('limit') ?? blockCap)
    const rows = selected.slice(0, Math.min(blockCap, limit)).map(row =>
      url.searchParams.get('select') === 'blocked_id' ? { blocked_id: row.blocked_id } : row)
    const page = { rows, count: exact ? String(selected.length) : null }
    const result = alterPage?.(page) ?? page
    return Response.json(result.rows, { headers: countHeaders(result.count) })
  }
  if (url.pathname === '/rest/v1/entraide_contact_requests') {
    if (request.method === 'HEAD') return new Response(null, { headers: countHeaders(exact ? quotaCount : null) })
    if (request.method === 'GET' && url.searchParams.get('select') === 'id,status,recipient_id,requester_id') {
      const row = { id: REQUEST, status: 'pending', recipient_id: A, requester_id: B }
      return Response.json(eq(url, 'id', REQUEST) && eq(url, 'recipient_id', A) ? [row] : [])
    }
    if (request.method === 'PATCH') return new Response(null, { status: 204 })
    if (request.method === 'GET' && ['id', 'responded_at'].includes(url.searchParams.get('select') ?? '')) {
      return Response.json([])
    }
    if (request.method === 'POST') return Response.json({ id: REQUEST }, { status: 201 })
  }
  if (url.pathname === '/rest/v1/entraide_signalements') {
    if (request.method === 'HEAD') return new Response(null, { headers: countHeaders(exact ? reportCount : null) })
    if (request.method === 'POST') return new Response(null, { status: 201 })
  }
  return refuse()
}
function makeClient(cookie: boolean) {
  return createClient('https://supabase.invalid', cookie ? 'synthetic-anon' : 'synthetic-service', {
    db: { schema: 'akasha_ai' },
    auth: { persistSession: cookie, autoRefreshToken: false, detectSessionInUrl: false, storageKey: STORAGE,
      storage: { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value) }, removeItem: key => { storage.delete(key) } } },
    global: { fetch: controlledFetch },
  })
}
let cookie: ReturnType<typeof makeClient>
let service: ReturnType<typeof makeClient>
const databaseCalls = () => calls.filter(call => call.url.pathname.startsWith('/rest/v1/'))
const contactWrites = () => calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/entraide_contact_requests'))
const request = (body: unknown, authorization = 'Bearer ' + tokenA) => new NextRequest('http://localhost/api/entraide/contacts', {
  method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const send = () => contact(request({ recipient_id: B, message: null }))
const unavailable = { error: 'Service Entraide indisponible' }

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0; unexpected.length = 0; storage.clear()
  blocks = []; blockCap = 1000; alterPage = null; quotaCount = '0'; reportCount = '4'; deniedTable = null
  actorId = A; tokenA = token(A); tokenC = token(C)
  storage.set(STORAGE, JSON.stringify({ access_token: tokenC, refresh_token: 'synthetic-refresh-C',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(C) }))
  vi.stubGlobal('fetch', vi.fn(async () => { unexpected.push('uncontrolled-fetch'); throw new Error('Uncontrolled fetch') }))
  cookie = makeClient(true); service = makeClient(false)
  factories.server.mockResolvedValue(cookie); factories.service.mockReturnValue(service)
})
afterEach(() => {
  try { expect(unexpected).toEqual([]) }
  finally { cookie.auth.stopAutoRefresh(); service.auth.stopAutoRefresh(); vi.unstubAllGlobals() }
})

describe('contact route with real SDK and canonical recipient block rule', () => {
  it('UUID case: refuses a block for an uppercase authenticated actor', async () => {
    actorId = A.toUpperCase()
    blocks = [{ blocker_id: B, blocked_id: A }]
    expect((await send()).status).toBe(400)
    expect(contactWrites()).toEqual([])
  })
  it('UUID case: rejects self-contact when recipient casing differs', async () => {
    const response = await contact(request({ recipient_id: A.toUpperCase(), message: null }))
    expect(response.status).toBe(400)
    expect(contactWrites()).toEqual([])
  })
  it.each([
    ['request', REQUEST.toUpperCase(), A], ['actor', REQUEST, A.toUpperCase()],
  ])('UUID case: accepts an authorized response with uppercase %s UUID', async (_label, id, actor) => {
    actorId = actor
    const response = await contact(request({ request_id: id, response: 'accept' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'accepted' })
    const writes = calls.filter(call => call.method === 'PATCH')
    expect(writes).toHaveLength(1)
    expect(writes[0].url.searchParams.get('id')).toBe('eq.' + REQUEST)
  })
  it('rejects a recipient block beyond 1001 unrelated rows without creating a request', async () => {
    blocks = [...Array.from({ length: 1001 }, (_, i) => ({ blocker_id: B, blocked_id: peer(i) })),
      { blocker_id: B, blocked_id: A }]
    const response = await send()
    expect(response.status).toBe(400)
    expect(contactWrites()).toEqual([])
    const call = databaseCalls().find(item => item.url.pathname.endsWith('/entraide_blocages'))!
    expect(call.url.searchParams.get('blocker_id')).toBe('eq.' + B)
    expect(call.url.searchParams.get('blocked_id')).toBe('eq.' + A)
    expect(call.url.searchParams.get('limit')).toBe('1')
    expect(call.headers.get('prefer')).toContain('count=exact')
  })
  it('preserves the outgoing-only rule and binds a permitted insert to bearer A despite cookie C', async () => {
    blocks = [{ blocker_id: A, blocked_id: B }]
    const response = await send()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ request_id: REQUEST })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(contactWrites()).toHaveLength(1)
    expect(contactWrites()[0].values).toEqual({ requester_id: A, recipient_id: B, message: null, status: 'pending' })
    expect((await cookie.auth.getSession()).data.session?.user.id).toBe(C)
  })
  it('preserves the refusal for a visible recipient block', async () => {
    blocks = [{ blocker_id: B, blocked_id: A }]
    expect((await send()).status).toBe(400)
    expect(contactWrites()).toEqual([])
  })
  it('does not fall back to cookie C when an explicit bearer fails', async () => {
    const response = await contact(request({ recipient_id: B, message: null }, 'Bearer invalid'))
    expect(response.status).toBe(401)
    expect(databaseCalls()).toEqual([])
    expect(factories.service).not.toHaveBeenCalled()
  })
  it.each([null, 'invalid', '-1', '9007199254740992', '1'])('refuses unusable block count %s', async count => {
    alterPage = page => ({ ...page, count })
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(unavailable)
    expect(contactWrites()).toEqual([])
  })
  it.each([
    ['wrong blocker', [{ blocker_id: C, blocked_id: A }], '1'],
    ['wrong blocked user', [{ blocker_id: B, blocked_id: C }], '1'],
    ['duplicate directed pair', [{ blocker_id: B, blocked_id: A }, { blocker_id: B, blocked_id: A }], '2'],
    ['invalid UUID', [{ blocker_id: B, blocked_id: 'invalid' }], '1'],
    ['missing identity', [{ blocked_id: A }], '1'],
    ['non-array page', {}, '0'],
    ['zero count with a row', [{ blocker_id: B, blocked_id: A }], '0'],
  ] as const)('refuses %s without inserting a contact', async (_name, rows, count) => {
    alterPage = () => ({ rows, count })
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(unavailable)
    expect(contactWrites()).toEqual([])
  })
  it('propagates a block read error without exposing provider details', async () => {
    deniedTable = 'entraide_blocages'
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(unavailable)
    expect(contactWrites()).toEqual([])
  })
  it('refuses a missing daily count before any contact insert', async () => {
    quotaCount = null
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(unavailable)
    expect(contactWrites()).toEqual([])
  })
  it('retains canonical quota refusal for a valid high count', async () => {
    quotaCount = '999'
    expect((await send()).status).toBe(400)
    expect(contactWrites()).toEqual([])
  })
})

describe('compatible full-list adapter and exact pair checks', () => {
  it('keeps the two-argument array contract for a complete list', async () => {
    blocks = [{ blocker_id: B, blocked_id: A }, { blocker_id: B, blocked_id: C }]
    expect(await getBlockedUserIds(service, B)).toEqual([A, C])
  })
  it('refuses the legacy full-list call when its response is truncated', async () => {
    blocks = Array.from({ length: 1001 }, (_, i) => ({ blocker_id: B, blocked_id: peer(i) }))
    await expect(getBlockedUserIds(service, B)).rejects.toThrow()
  })
  it('refuses duplicate peers in a full-list response', async () => {
    blocks = [{ blocker_id: B, blocked_id: A }, { blocker_id: B, blocked_id: A }]
    await expect(getBlockedUserIds(service, B)).rejects.toThrow()
  })
  it('accepts an absent exact pair and canonical UUID casing', async () => {
    expect(await getBlockedUserIds(service, B, A)).toEqual([])
    blocks = [{ blocker_id: B, blocked_id: A }]
    expect(await getBlockedUserIds(service, B.toUpperCase(), A.toUpperCase())).toEqual([A])
  })
  it.each([['invalid', A], [B, 'invalid']])('refuses invalid pair input %s / %s before a DB read', async (blocker, blocked) => {
    await expect(getBlockedUserIds(service, blocker, blocked)).rejects.toThrow()
    expect(databaseCalls()).toEqual([])
  })
})

describe.each(['quota', 'reports'] as const)('%s adapter exact count', kind => {
  const invoke = () => kind === 'quota' ? getContactRequestsSentToday(service, A) : getActiveReportCount(service, B)
  const setCount = (value: string | null) => { if (kind === 'quota') quotaCount = value; else reportCount = value }
  it.each([null, 'invalid', '-1', '9007199254740992'])('refuses missing or invalid count %s', async value => {
    setCount(value)
    await expect(invoke()).rejects.toThrow()
  })
  it.each(['0', '4'])('preserves the valid count %s', async value => {
    setCount(value)
    expect(await invoke()).toBe(Number(value))
  })
  it('keeps database errors as failures', async () => {
    deniedTable = kind === 'quota' ? 'entraide_contact_requests' : 'entraide_signalements'
    await expect(invoke()).rejects.toThrow('Entraide database request failed')
  })
})

it('report POST refuses a missing count after persistence rather than returning success and zero', async () => {
  reportCount = null
  const response = await report(request({ target_id: B, reason: 'Synthetic report regression' }))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual(unavailable)
  expect(calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/entraide_signalements'))).toHaveLength(1)
})
