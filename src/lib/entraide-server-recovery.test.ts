import { describe, expect, it } from 'vitest'
import { fixture, A, B, C, REQUEST, MISSION, request, service, missionRow } from './entraide-server.test-support'
import { POST as contact } from '@/app/api/entraide/contacts/route'
import { POST as mission } from '@/app/api/entraide/missions/route'
import {
  getBlockedUserIds, getContactRequestsSentToday, getPendingRequestToRecipient,
  getLastDeclineOrExpiry, getMissionCollectiveDB, persistMissionCollective,
  removeMissionParticipant, createMissionCollectiveDB, updateContactRequestStatus,
} from '@/lib/entraide'

describe('contact block recovery', () => {
  it('refuses a request read error before any write', async () => {
    fixture.run.mockReturnValue({ data: null, error: { message: 'read failed' } })
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(503)
    expect(fixture.queries.every(query => query.action === 'select')).toBe(true)
  })
  it('rejects another recipient without a block or status mutation', async () => {
    fixture.run.mockReturnValue({ data: { id: REQUEST, status: 'blocked', recipient_id: B, requester_id: C }, error: null })
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(404)
    expect(fixture.queries.every(query => query.action === 'select')).toBe(true)
  })
  it('keeps a protective block when status fails, then retries the pending request', async () => {
    let blocked = false
    let failStatus = true
    let status = 'pending'
    fixture.run.mockImplementation(query => {
      if (query.table === 'entraide_blocages') { blocked = true; return { data: null, error: null } }
      if (query.action === 'update') {
        if (failStatus) return { data: null, error: { message: 'status rejected' } }
        status = 'blocked'
        return { data: null, error: null }
      }
      return { data: { id: REQUEST, status, recipient_id: A, requester_id: B }, error: null }
    })
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(503)
    expect(blocked).toBe(true)
    expect(status).toBe('pending')
    failStatus = false
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(200)
    expect(status).toBe('blocked')
  })
  it('replays a committed block after the first response is lost', async () => {
    let status = 'pending'
    let writes = 0
    fixture.run.mockImplementation(query => {
      if (query.table === 'entraide_blocages') return { data: null, error: null }
      if (query.action === 'update') {
        writes += 1
        status = 'blocked'
        return { data: null, error: { message: 'ack lost after commit' } }
      }
      return { data: { id: REQUEST, status, recipient_id: A, requester_id: B }, error: null }
    })
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(503)
    const replay = await contact(request('contacts', { request_id: REQUEST, response: 'block' }))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ status: 'blocked' })
    expect(writes).toBe(1)
  })
  it('repairs an existing blocked status whose block row was missing', async () => {
    fixture.run.mockReturnValue({ data: { id: REQUEST, status: 'blocked', recipient_id: A, requester_id: B }, error: null })
    expect((await contact(request('contacts', { request_id: REQUEST, response: 'block' }))).status).toBe(200)
    expect(fixture.queries.find(query => query.table === 'entraide_blocages')?.values)
      .toEqual({ blocker_id: A, blocked_id: B })
    expect(fixture.queries.filter(query => query.action === 'update')).toHaveLength(0)
  })
  it.each(['accept', 'decline'])('keeps canonical refusal of %s on an already blocked request', async response => {
    fixture.run.mockReturnValue({ data: { id: REQUEST, status: 'blocked', recipient_id: A, requester_id: B }, error: null })
    expect((await contact(request('contacts', { request_id: REQUEST, response }))).status).toBe(400)
    expect(fixture.queries.every(query => query.action === 'select')).toBe(true)
  })
})

describe('existing adapter failures remain failures', () => {
  const snapshot = {
    id: MISSION, status: 'prete' as const, minParticipants: 2, maxParticipants: null, participantIds: [A, B],
  }
  it.each([
    ['blocks', () => getBlockedUserIds(service, A)],
    ['quota', () => getContactRequestsSentToday(service, A)],
    ['pending', () => getPendingRequestToRecipient(service, A, B)],
    ['cooldown', () => getLastDeclineOrExpiry(service, A, B)],
    ['mission read', () => getMissionCollectiveDB(service, MISSION)],
    ['mission status', () => persistMissionCollective(service, snapshot)],
    ['participant removal', () => removeMissionParticipant(service, MISSION, A)],
    ['contact status', () => updateContactRequestStatus(service, REQUEST, 'accepted')],
  ])('propagates %s errors instead of manufacturing successful data', async (_label, invoke) => {
    fixture.run.mockReturnValue({ data: null, error: { message: 'private data error' } })
    await expect(invoke()).rejects.toThrow('Entraide database request failed')
  })
  it('preserves legitimate missing mission, request, cooldown and zero count', async () => {
    fixture.run.mockReturnValue({ data: null, error: null, count: 0 })
    expect(await getMissionCollectiveDB(service, MISSION)).toBeNull()
    expect(await getPendingRequestToRecipient(service, A, B)).toBe(false)
    expect(await getLastDeclineOrExpiry(service, A, B)).toBeNull()
    expect(await getContactRequestsSentToday(service, A)).toBe(0)
  })
  it('refuses a mission creation when organizer auto-join fails', async () => {
    fixture.run.mockImplementation(query => query.table === 'missions_collectives'
      ? { data: { id: MISSION }, error: null }
      : { data: null, error: { message: 'auto-join failed' } })
    await expect(createMissionCollectiveDB(service, A, 'Title', '', 2, null)).rejects.toThrow()
  })
  it('refuses a participant upsert error after the mission status write', async () => {
    fixture.run.mockImplementation(query => query.table === 'missions_collectives'
      ? { data: null, error: null } : { data: null, error: { message: 'participants failed' } })
    await expect(persistMissionCollective(service, snapshot)).rejects.toThrow()
  })
  it('keeps the organizer check tied to bearer A despite cookie B', async () => {
    fixture.getUser.mockImplementation(async (token?: string) => ({
      data: { user: { id: token ? A : B } }, error: null,
    }))
    fixture.run.mockReturnValue({ data: missionRow(B), error: null })
    const response = await mission(request('missions', { mission_id: MISSION, action: 'start', user_id: B }))
    expect(response.status).toBe(403)
    expect(fixture.queries.every(query => query.role === 'service' && query.action === 'select')).toBe(true)
  })
  it('persists a new mission and its organizer with verified A rather than body or cookie B', async () => {
    fixture.getUser.mockImplementation(async (token?: string) => ({
      data: { user: { id: token ? A : B } }, error: null,
    }))
    fixture.run.mockReturnValue({ data: { id: MISSION }, error: null })
    const response = await mission(request('missions', {
      title: 'Useful mission', description: '', min_participants: 2, max_participants: null, organizer_id: B,
    }))
    expect(response.status).toBe(200)
    expect(fixture.queries[0].values).toMatchObject({ organizer_id: A })
    expect(fixture.queries[1].values).toEqual({ mission_id: MISSION, user_id: A })
    expect(fixture.queries.every(query => query.role === 'service')).toBe(true)
  })
})
