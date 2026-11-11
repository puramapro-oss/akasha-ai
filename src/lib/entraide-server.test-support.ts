import { beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Query = {
  role: string; table: string; action: string; columns?: string;
  values?: unknown; filters: Array<[string, unknown]>; cap?: number; countMode?: string
}
type Result = { data: unknown; error: null | { message: string; code?: string }; count?: number }
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const REQUEST = '44444444-4444-4444-8444-444444444444'
const fixture = vi.hoisted(() => {
  const queries: Query[] = []
  const run = vi.fn<(query: Query) => Result>()
  const getUser = vi.fn()
  function client(role: string) {
    return {
      auth: { getUser },
      from(table: string) {
        const query: Query = { role, table, action: 'select', filters: [] }
        queries.push(query)
        const chain = {
          select(columns?: string, options?: { count?: string }) {
            query.columns = columns; query.countMode = options?.count; return chain
          },
          eq(column: string, value: unknown) { query.filters.push([column, value]); return chain },
          neq(column: string, value: unknown) { query.filters.push(['neq:' + column, value]); return chain },
          or(value: string) { query.filters.push(['or', value]); return chain },
          gte(column: string, value: unknown) { query.filters.push(['gte:' + column, value]); return chain },
          in(column: string, value: unknown) { query.filters.push(['in:' + column, value]); return chain },
          order() { return chain },
          limit(value: number) { query.cap = value; return chain },
          upsert(values: unknown) { query.action = 'upsert'; query.values = values; return chain },
          insert(values: unknown) { query.action = 'insert'; query.values = values; return chain },
          update(values: unknown) { query.action = 'update'; query.values = values; return chain },
          delete() { query.action = 'delete'; return chain },
          single() { return chain },
          maybeSingle() { return chain },
          then(resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve().then(() => run(query)).then(resolve, reject)
          },
        }
        return chain
      },
    }
  }
  const cookie = client('cookie')
  const service = client('service')
  return { queries, run, getUser, cookie, service, serviceFactory: vi.fn(() => service) }
})
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => fixture.cookie),
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: fixture.serviceFactory }))
vi.mock('@purama/entraide', async importOriginal => {
  const actual = await importOriginal<typeof import('@purama/entraide')>()
  return { ...actual, computeMatchScore: vi.fn(actual.computeMatchScore) }
})


const own = (userId = A) => ({
  user_id: userId, skills_offered: ['design'], skills_needed: ['code'],
  availability_days: ['mon'], radius_km: null, location_lat: null, location_lng: null,
})
function request(path: string, body?: unknown, token = 'token-A') {
  return new NextRequest('http://localhost/api/entraide/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
beforeEach(() => {
  fixture.queries.length = 0
  vi.clearAllMocks()
  fixture.getUser.mockResolvedValue({ data: { user: { id: A } }, error: null })
  fixture.run.mockImplementation(query => ({
    data: query.table === 'entraide_profils' ? own()
      : query.table === 'entraide_contact_requests'
        ? { id: REQUEST, status: 'pending', recipient_id: A, requester_id: B } : [],
    error: null, count: 0,
  }))
})

import type { createServiceClient } from '@/lib/supabase'

const C = '33333333-3333-4333-8333-333333333333'
const MISSION = '55555555-5555-4555-8555-555555555555'
const service = fixture.service as unknown as ReturnType<typeof createServiceClient>
const candidate = (id = B) => ({
  ...own(id), skills_offered: ['code'], skills_needed: ['design'],
  location_lat: 48.8, location_lng: 2.3, email: 'must-not-leak@example.invalid',
})
function matchingRows(blocks: unknown[] = [], profiles: unknown[] = [candidate()]) {
  fixture.run.mockImplementation(query => {
    if (query.table === 'entraide_blocages') {
      const actorColumn = query.filters.some(([key]) => key === 'blocker_id') ? 'blocker_id' : 'blocked_id'
      const rows = blocks.filter(value => {
        if (!value || typeof value !== 'object') return true
        const row = value as Record<string, unknown>
        // Keep malformed/out-of-scope rows visible to the production validator.
        return (row.blocker_id !== A && row.blocked_id !== A) || row[actorColumn] === A
      })
      return { data: rows, error: null, count: rows.length }
    }
    const candidates = query.filters.some(([key]) => key === 'neq:user_id')
    return { data: candidates ? profiles : own(), error: null, count: candidates ? profiles.length : 1 }
  })
}
const missionRow = (organizer = A) => ({
  id: MISSION, organizer_id: organizer, min_participants: 2, max_participants: null,
  status: 'prete', missions_collectives_participants: [{ user_id: A }, { user_id: B }],
})


export { fixture, A, B, C, REQUEST, MISSION, request, own, candidate, matchingRows, missionRow, service }
