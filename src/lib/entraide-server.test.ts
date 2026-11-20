import { describe, expect, it, vi } from 'vitest'
import {
  fixture, A, B, C, REQUEST, MISSION, request, own, candidate, matchingRows,
} from './entraide-server.test-support'
import { computeMatchScore } from '@purama/entraide'
import { GET as getProfile, POST as saveProfile } from '@/app/api/entraide/profile/route'
import { GET as getMatches } from '@/app/api/entraide/matches/route'
import { POST as contact } from '@/app/api/entraide/contacts/route'
import { POST as mission } from '@/app/api/entraide/missions/route'

describe('Entraide regression evidence', () => {
  it('refuses a profile database error instead of returning a successful empty profile', async () => {
    fixture.run.mockReturnValue({ data: null, error: { message: 'private database detail', code: '42501' } })
    const response = await getProfile(request('profile'))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private database detail')
  })
  it('verifies the captured bearer instead of admitting the ambient cookie account', async () => {
    await getProfile(request('profile'))
    expect(fixture.getUser).toHaveBeenCalledWith('token-A')
  })
  it('does not claim a block succeeded when the database rejects the block', async () => {
    fixture.run.mockImplementation(query => query.table === 'entraide_blocages'
      ? { data: null, error: { message: 'block write rejected' } }
      : { data: { id: REQUEST, status: 'pending', recipient_id: A, requester_id: B }, error: null })
    const response = await contact(request('contacts', { request_id: REQUEST, response: 'block' }))
    expect(response.status).toBe(503)
    expect(fixture.queries.filter(query => query.action === 'update')).toHaveLength(0)
  })
})

describe('verified actor and own profile', () => {
  it.each([
    ['profile GET', (token: string) => getProfile(request('profile', undefined, token))],
    ['profile POST', (token: string) => saveProfile(request('profile', {}, token))],
    ['matches GET', (token: string) => getMatches(request('matches', undefined, token))],
    ['missions POST', (token: string) => mission(request('missions', { mission_id: MISSION, action: 'join' }, token))],
    ['contacts POST', (token: string) => contact(request('contacts', { request_id: REQUEST, response: 'block' }, token))],
  ])('%s never falls back from invalid bearer A to valid cookie B', async (_label, invoke) => {
    fixture.getUser.mockImplementation(async (token?: string) => token
      ? { data: { user: null }, error: { status: 401, message: 'invalid token' } }
      : { data: { user: { id: B } }, error: null })
    const response = await invoke('invalid-A')
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.getUser).toHaveBeenCalledExactlyOnceWith('invalid-A')
    expect(fixture.serviceFactory).not.toHaveBeenCalled()
    expect(fixture.queries).toHaveLength(0)
  })
  it('rejects malformed authorization without trying cookies', async () => {
    const req = request('profile')
    req.headers.set('Authorization', 'Basic not-a-bearer')
    expect((await getProfile(req)).status).toBe(401)
    expect(fixture.getUser).not.toHaveBeenCalled()
  })
  it('distinguishes an unavailable auth provider from a missing profile', async () => {
    fixture.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } })
    expect((await getProfile(request('profile'))).status).toBe(503)
    expect(fixture.serviceFactory).not.toHaveBeenCalled()
  })
  it('preserves verified cookie admission when no bearer is supplied', async () => {
    const req = request('profile')
    req.headers.delete('Authorization')
    expect((await getProfile(req)).status).toBe(200)
    expect(fixture.getUser).toHaveBeenCalledWith()
  })
  it('keeps a genuinely absent own profile distinct from errors', async () => {
    fixture.run.mockReturnValue({ data: null, error: null })
    const response = await getProfile(request('profile'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ profile: null })
    expect(fixture.queries[0]).toMatchObject({
      role: 'service', table: 'entraide_profils', filters: [['user_id', A]],
    })
    expect(fixture.queries[0].columns).not.toContain('*')
  })
  it('rejects a profile row that belongs to another actor', async () => {
    fixture.run.mockReturnValue({ data: candidate(B), error: null })
    const response = await getProfile(request('profile'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Profil Entraide indisponible' })
  })
  it('bounds privileged upsert to A despite cookie B and body.user_id B', async () => {
    fixture.getUser.mockImplementation(async (token?: string) => ({
      data: { user: { id: token ? A : B } }, error: null,
    }))
    fixture.run.mockReturnValue({ data: { ...own(), location_lat: 48.8, location_lng: 2.3, email: 'private' }, error: null })
    const response = await saveProfile(request('profile', {
      user_id: B, skills_offered: ['design'], location_lat: 48.8, location_lng: 2.3,
      email: 'forged', radius_km: 10,
    }))
    expect(response.status).toBe(200)
    expect(fixture.queries).toHaveLength(1)
    expect(fixture.queries[0]).toMatchObject({ role: 'service', action: 'upsert' })
    expect(fixture.queries[0].values).toMatchObject({ user_id: A, location_lat: 48.8, location_lng: 2.3 })
    expect(fixture.queries[0].values).not.toHaveProperty('email')
    expect(fixture.queries[0].columns).not.toContain('*')
    expect(await response.json()).toEqual({ profile: { ...own(), location_lat: 48.8, location_lng: 2.3 } })
  })
  it('rejects invalid profile data before privileged access', async () => {
    expect((await saveProfile(request('profile', { location_lat: 120 }))).status).toBe(400)
    expect(fixture.serviceFactory).not.toHaveBeenCalled()
  })
  it('refuses an upsert error and does not expose database details', async () => {
    fixture.run.mockReturnValue({ data: null, error: { message: 'private provider detail' } })
    const response = await saveProfile(request('profile', { skills_offered: ['code'] }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private provider detail')
  })
})

describe('canonical server matching and public projection', () => {
  it('returns a positive canonical match without any candidate coordinates or profile fields', async () => {
    matchingRows()
    const response = await getMatches(request('matches'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0].userId).toBe(B)
    expect(body.matches[0].score).toBeGreaterThan(0)
    expect(body.matches[0].score).toBeLessThanOrEqual(100)
    expect(Object.keys(body.matches[0]).sort()).toEqual(['reasons', 'score', 'userId'])
    expect(JSON.stringify(body)).not.toMatch(/location|48\.8|2\.3|skills_|blocked|email|private/)
    expect(body).toMatchObject({ scanned_profiles: 1, truncated: false })
    expect(fixture.queries.every(query => query.role === 'service')).toBe(true)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it.each(['incoming', 'outgoing'])('filters %s blocks and refreshes them for every request', async direction => {
    const blocks: unknown[] = []
    matchingRows(blocks)
    expect((await (await getMatches(request('matches'))).json()).matches).toHaveLength(1)
    blocks.push(direction === 'incoming'
      ? { blocker_id: B, blocked_id: A } : { blocker_id: A, blocked_id: B })
    expect((await (await getMatches(request('matches'))).json()).matches).toEqual([])
    const queries = fixture.queries.filter(query => query.table === 'entraide_blocages')
    expect(queries).toHaveLength(4)
    for (const offset of [0, 2]) {
      expect(queries[offset].filters).toEqual([['blocker_id', A], ['in:blocked_id', [B]]])
      expect(queries[offset + 1].filters).toEqual([['blocked_id', A], ['in:blocker_id', [B]]])
    }
    expect(queries.every(query => query.countMode === 'exact' && query.cap === 1)).toBe(true)
  })
  it('excludes score-zero candidates using the actual engine', async () => {
    matchingRows([], [{ ...candidate(), skills_offered: [], skills_needed: [], availability_days: [] }])
    expect((await (await getMatches(request('matches'))).json()).matches).toEqual([])
  })
  it('returns an empty honest result for a missing own profile without scanning peers', async () => {
    fixture.run.mockReturnValue({ data: null, error: null })
    const response = await getMatches(request('matches'))
    expect(await response.json()).toEqual({ matches: [], scanned_profiles: 0, truncated: false })
    expect(fixture.queries).toHaveLength(1)
  })
  it.each(['entraide_blocages', 'candidates'])('fails closed on %s read errors', async target => {
    matchingRows()
    const normal = fixture.run.getMockImplementation()!
    fixture.run.mockImplementation(query => (target === 'candidates'
      ? query.filters.some(([key]) => key === 'neq:user_id') : query.table === target)
      ? { data: null, error: { message: 'private query failure' } } : normal(query))
    const response = await getMatches(request('matches'))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private query failure')
  })
  it('refuses an out-of-scope block row', async () => {
    matchingRows([{ blocker_id: B, blocked_id: C }])
    expect((await getMatches(request('matches'))).status).toBe(503)
  })
  it('marks the 500-candidate bound as truncated', async () => {
    const profiles = Array.from({ length: 501 }, (_, index) =>
      candidate('66666666-6666-4666-8666-' + String(index).padStart(12, '0')))
    matchingRows([], profiles)
    const response = await getMatches(request('matches'))
    const body = await response.json()
    expect(body).toMatchObject({ scanned_profiles: 500, truncated: true })
    expect(body.matches).toHaveLength(500)
    expect(fixture.queries.find(query => query.cap)?.cap).toBe(501)
  })
})

describe('invalid canonical result boundary', () => {
  it.each([NaN, Infinity, -Infinity])('refuses a non-finite score before filtering: %s', async score => {
    matchingRows()
    // Fault injection only for the output boundary; all other matching cases call the real engine.
    vi.mocked(computeMatchScore).mockReturnValueOnce({ score, reasons: [] })
    const response = await getMatches(request('matches'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Correspondances indisponibles' })
  })
})
