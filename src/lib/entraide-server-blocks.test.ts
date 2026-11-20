import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getEntraideMatches } from './entraide-server'
import type { OwnProfile } from './entraide-contracts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const id = (index: number) => '66666666-6666-4666-8666-' + String(index).padStart(12, '0')
type Block = { blocker_id: string; blocked_id: string }
type Table = 'profiles' | 'blocks'
type Page = { rows: unknown; count: string | null }
type Options = {
  profiles?: OwnProfile[]; blocks?: Block[]; candidateCap?: number; blockCap?: number
  corrupt?: (table: Table, page: Page, url: URL) => Page
}
function profile(user_id: string): OwnProfile {
  return {
    user_id, skills_offered: user_id === A ? ['design'] : ['code'],
    skills_needed: user_id === A ? ['code'] : ['design'], availability_days: ['mon'],
    radius_km: null, location_lat: null, location_lng: null,
  }
}
function matchesFilter(value: string, filter: string | null) {
  if (!filter) return true
  if (filter.startsWith('eq.')) return value === filter.slice(3)
  if (filter.startsWith('in.(') && filter.endsWith(')')) return filter.slice(4, -1).split(',').includes(value)
  throw new Error('Unexpected synthetic filter')
}
function response(page: Page) {
  const rows = Array.isArray(page.rows) ? page.rows.length : 0
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (page.count !== null) headers.set('Content-Range', (rows ? '0-' + (rows - 1) : '*') + '/' + page.count)
  return new Response(JSON.stringify(page.rows), { status: 200, headers })
}
function fixture(options: Options = {}) {
  const calls: URL[] = []
  const violations: string[] = []
  const profiles = options.profiles ?? [profile(B)]
  const blocks = options.blocks ?? []
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    calls.push(url)
    const table: Table = url.pathname === '/rest/v1/entraide_profils' ? 'profiles' : 'blocks'
    if (url.origin !== 'http://supabase.invalid' || request.method !== 'GET' ||
      !['/rest/v1/entraide_profils', '/rest/v1/entraide_blocages'].includes(url.pathname) ||
      request.headers.get('authorization') !== 'Bearer synthetic-service' ||
      request.headers.get('accept-profile') !== 'akasha_ai') {
      violations.push(request.method + ' ' + url.origin + url.pathname)
      return new Response('{}', { status: 403 })
    }
    if (table === 'profiles' && url.searchParams.get('user_id') === 'eq.' + A) {
      return response({ rows: [profile(A)], count: null })
    }
    const selected = table === 'profiles'
      ? profiles.filter(row => row.user_id !== A).toSorted((a, b) => a.user_id.localeCompare(b.user_id))
      : blocks.filter(row => url.searchParams.has('or')
        ? row.blocker_id === A || row.blocked_id === A
        : matchesFilter(row.blocker_id, url.searchParams.get('blocker_id')) &&
          matchesFilter(row.blocked_id, url.searchParams.get('blocked_id')))
    const cap = table === 'profiles' ? options.candidateCap ?? 1000 : options.blockCap ?? 1000
    const limit = Number(url.searchParams.get('limit') ?? cap)
    const page = {
      rows: selected.slice(0, Math.min(cap, limit)),
      count: request.headers.get('prefer')?.includes('count=exact') ? String(selected.length) : null,
    }
    return response(options.corrupt?.(table, page, url) ?? page)
  }
  const client = createClient('http://supabase.invalid', 'synthetic-service', {
    db: { schema: 'akasha_ai' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  })
  return {
    calls,
    async run() {
      try { return await getEntraideMatches(A, client) }
      finally { expect(violations).toEqual([]) }
    },
  }
}
function block(direction: 'incoming' | 'outgoing', peer = B): Block {
  return direction === 'incoming' ? { blocker_id: peer, blocked_id: A } : { blocker_id: A, blocked_id: peer }
}
function blockCalls(calls: URL[]) {
  return calls.filter(url => url.pathname.endsWith('/entraide_blocages'))
}
const unavailable = { status: 503, message: 'Correspondances indisponibles' }

describe('real PostgREST transport: candidate-linked block completeness', () => {
  it.each(['incoming', 'outgoing'] as const)('keeps a relevant %s block beyond 1001 unrelated rows', async direction => {
    const unrelated = Array.from({ length: 1001 }, (_, index) => block('outgoing', id(index)))
    const f = fixture({ blocks: [...unrelated, block(direction)] })
    expect(await f.run()).toEqual({ matches: [], scanned_profiles: 1, truncated: false })
    const queries = blockCalls(f.calls)
    expect(queries).toHaveLength(2)
    expect(queries.some(url => url.searchParams.get('blocker_id') === 'eq.' + A &&
      url.searchParams.get('blocked_id') === 'in.(' + B + ')')).toBe(true)
    expect(queries.some(url => url.searchParams.get('blocked_id') === 'eq.' + A &&
      url.searchParams.get('blocker_id') === 'in.(' + B + ')')).toBe(true)
  })
  it('combines mutual blocks without treating the two directions as duplicate rows', async () => {
    const f = fixture({ blocks: [block('incoming'), block('outgoing')] })
    expect((await f.run()).matches).toEqual([])
  })
  it('accepts exact zero block counts and retains a positive canonical match', async () => {
    const result = await fixture().run()
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].score).toBeGreaterThan(0)
    expect(Object.keys(result.matches[0]).sort()).toEqual(['reasons', 'score', 'userId'])
  })
  it.each(['incoming', 'outgoing'] as const)('refuses a capped %s block response even when HTTP succeeds', async direction => {
    await expect(fixture({ profiles: [profile(B), profile(id(1))], blocks: [block(direction), block(direction, id(1))], blockCap: 1 }).run()).rejects.toMatchObject(unavailable)
  })
  it.each(['incoming', 'outgoing'] as const)('refuses a missing count for the %s direction', async direction => {
    const actorColumn = direction === 'incoming' ? 'blocked_id' : 'blocker_id'
    const f = fixture({
      blocks: [block(direction)],
      corrupt: (table, page, url) => table === 'blocks' && url.searchParams.get(actorColumn) === 'eq.' + A
        ? { ...page, count: null } : page,
    })
    await expect(f.run()).rejects.toMatchObject(unavailable)
  })
  it.each(['-1', 'invalid', '9007199254740992'])('refuses malformed block count %s', async count => {
    const f = fixture({ corrupt: (table, page) => table === 'blocks' ? { ...page, count } : page })
    await expect(f.run()).rejects.toMatchObject(unavailable)
  })
  it.each([
    ['wrong actor', [{ blocker_id: id(1), blocked_id: B }]],
    ['peer outside batch', [{ blocker_id: A, blocked_id: id(1) }]],
    ['duplicate directed edge', [block('outgoing'), block('outgoing')]],
    ['invalid identity', [{ blocker_id: A, blocked_id: 'not-a-uuid' }]],
  ])('refuses %s in a successful response', async (_label, rows) => {
    const f = fixture({
      corrupt: (table, page, url) => table === 'blocks' && (url.searchParams.get('blocker_id') === 'eq.' + A || url.searchParams.has('or'))
        ? { rows, count: String(rows.length) } : page,
    })
    await expect(f.run()).rejects.toMatchObject(unavailable)
  })
  it('refuses a non-array block response instead of assuming an empty set', async () => {
    const f = fixture({ corrupt: (table, page) => table === 'blocks' ? { rows: {}, count: '0' } : page })
    await expect(f.run()).rejects.toMatchObject(unavailable)
  })
  it('bounds each direction to 100 candidate UUIDs and every emitted URL below 8KB', async () => {
    const f = fixture({ profiles: Array.from({ length: 502 }, (_, index) => profile(id(index))) })
    const result = await f.run()
    expect(result).toMatchObject({ scanned_profiles: 500, truncated: true })
    expect(result.matches).toHaveLength(500)
    const queries = blockCalls(f.calls)
    expect(queries).toHaveLength(10)
    for (const direction of ['incoming', 'outgoing'] as const) {
      const actorColumn = direction === 'incoming' ? 'blocked_id' : 'blocker_id'
      const peerColumn = direction === 'incoming' ? 'blocker_id' : 'blocked_id'
      const peers = queries.filter(url => url.searchParams.get(actorColumn) === 'eq.' + A).flatMap(url => {
        expect(url.href.length).toBeLessThan(8192)
        expect(url.searchParams.has('or')).toBe(false)
        const members = url.searchParams.get(peerColumn)!.slice(4, -1).split(',')
        expect(members.length).toBeLessThanOrEqual(100)
        return members
      })
      expect(peers.toSorted()).toEqual(Array.from({ length: 500 }, (_, index) => id(index)))
    }
  })
})

describe('real PostgREST transport: honest candidate completeness', () => {
  it('marks candidates truncated when the server cap is below the requested 501', async () => {
    const f = fixture({ profiles: [profile(B), profile(id(1))], candidateCap: 1 })
    expect(await f.run()).toMatchObject({ scanned_profiles: 1, truncated: true })
    expect(blockCalls(f.calls)).toHaveLength(2)
  })
  it('accepts no candidates with exact zero and performs no block read', async () => {
    const f = fixture({ profiles: [] })
    expect(await f.run()).toEqual({ matches: [], scanned_profiles: 0, truncated: false })
    expect(blockCalls(f.calls)).toHaveLength(0)
  })
  it.each([null, '-1', 'invalid', '0', '9007199254740992'])('refuses unusable candidate count %s', async count => {
    const f = fixture({ corrupt: (table, page) => table === 'profiles' ? { ...page, count } : page })
    await expect(f.run()).rejects.toMatchObject(unavailable)
    expect(blockCalls(f.calls)).toHaveLength(0)
  })
  it.each([
    ['duplicate candidate', [profile(B), profile(B)]],
    ['actor returned as a peer', [profile(A)]],
    ['invalid peer identity', [{ ...profile(B), user_id: 'invalid-uuid' }]],
  ])('refuses %s before querying block identities', async (_label, rows) => {
    const f = fixture({
      corrupt: (table, page) => table === 'profiles' ? { rows, count: String(rows.length) } : page,
    })
    await expect(f.run()).rejects.toMatchObject({ status: 503 })
    expect(blockCalls(f.calls)).toHaveLength(0)
  })
})
