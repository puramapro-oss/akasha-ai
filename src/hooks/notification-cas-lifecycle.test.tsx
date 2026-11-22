// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { A, B, actor, fixture, mountHook, pending, reads, respond } from './lifecycle-recovery.test-support'
import { useSettingsData } from './useSettingsData'

describe('conditional notification saves through the real Supabase transport', () => {
  it('does not persist untouched defaults when there is no notification edit', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), { user_id: A, types: { newsletter: true } })
    await act(async () => { await view.value.handleSaveNotifs() })
    expect(reads).toHaveLength(1)
    expect(fixture.success).not.toHaveBeenCalled()
  })

  it('re-reads after a zero-row CAS and merges the edit into the newer opt-out and unknown JSON', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const original = { user_id: A, types: { newsletter: true, quota_alerts: true } }
    await respond(pending('notification_preferences', A), original)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), original)
    const staleWrite = pending('notification_preferences', A)
    expect(staleWrite.method).toBe('PATCH')
    expect(staleWrite.url.searchParams.get('types')).toBe('eq.' + JSON.stringify(original.types))
    await respond(staleWrite, [])
    const latest = { user_id: A, types: { newsletter: false, quota_alerts: true,
      future_kind: { 'a,b': 'value("quoted")\\tail', options: [false, { nested: 'x(y)' }] } },
    paused_until: '2027-01-01T00:00:00Z' }
    await respond(pending('notification_preferences', A), latest)
    const write = pending('notification_preferences', A)
    expect(write.url.searchParams.get('types')).toBe('eq.' + JSON.stringify(latest.types))
    expect(write.url.href).not.toContain('object+Object')
    expect(write.body).toEqual({ types: { ...latest.types, quota_alerts: false } })
    const persisted = { ...latest, ...(write.body as object) }
    expect(persisted.paused_until).toBe(latest.paused_until)
    await respond(write, [persisted])
    await act(async () => { await saving })
    expect(view.value.notifSettings.newsletter).toBe(false)
    expect(view.value.notifSettings.quota_alerts).toBe(false)
    expect(fixture.success).toHaveBeenCalledOnce()
    expect(reads.filter(read => read.method === 'PATCH')).toHaveLength(2)
  })

  it('creates an absent row with INSERT and only edited fields, without merge-duplicates', async () => {
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()!
    const headers: Headers[] = []
    fetchMock.mockImplementation((input, init) => {
      headers.push(new Headers(init?.headers))
      return originalFetch(input, init)
    })
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), null)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), null)
    const write = pending('notification_preferences')
    expect(write.method).toBe('POST')
    expect(write.body).toEqual({ user_id: A, types: { quota_alerts: false } })
    expect(write.url.searchParams.has('on_conflict')).toBe(false)
    expect(headers.at(-1)?.get('prefer')).not.toContain('merge-duplicates')
    await respond(write, write.body, 201)
    await act(async () => { await saving })
    expect(fixture.success).toHaveBeenCalledOnce()
  })

  it('re-reads a concurrent user_id insert instead of replacing its preferences', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), null)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), null)
    const insert = pending('notification_preferences')
    expect(insert.method).toBe('POST')
    await respond(insert, { code: '23505', message: 'duplicate key value violates unique constraint notification_preferences_user_id_key' }, 409)
    const winner = { user_id: A, types: { newsletter: false, weekly_digest: false, future_kind: true } }
    await respond(pending('notification_preferences', A), winner)
    const update = pending('notification_preferences', A)
    expect(update.method).toBe('PATCH')
    expect(update.body).toEqual({ types: { ...winner.types, quota_alerts: false } })
    expect(update.url.searchParams.get('types')).toBe('eq.' + JSON.stringify(winner.types))
    await respond(update, [{ user_id: A, ...(update.body as object) }])
    await act(async () => { await saving })
    expect(fixture.success).toHaveBeenCalledOnce()
    expect(view.value.notifSettings.newsletter).toBe(false)
    expect(view.value.notifSettings.weekly_digest).toBe(false)
    expect(reads.filter(read => read.method === 'POST')).toHaveLength(1)
  })

  it('uses a conditional null predicate for historical SQL NULL or JSON null types', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const legacy = { user_id: A, types: null }
    await respond(pending('notification_preferences', A), legacy)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), legacy)
    const write = pending('notification_preferences', A)
    expect(write.method).toBe('PATCH')
    expect(write.url.searchParams.get('or')).toBe('(types.is.null,types.eq.null)')
    expect(write.url.searchParams.has('types')).toBe(false)
    expect(write.body).toEqual({ types: { quota_alerts: false } })
    await respond(write, [{ user_id: A, ...(write.body as object) }])
    await act(async () => { await saving })
    expect(fixture.success).toHaveBeenCalledOnce()
  })

  it('keeps later local edits when the prior submitted values are acknowledged', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const stored = { user_id: A, types: { newsletter: false, quota_alerts: true } }
    await respond(pending('notification_preferences', A), stored)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), stored)
    const write = pending('notification_preferences', A)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: true, newsletter: true })))
    await respond(write, [{ user_id: A, ...(write.body as object) }])
    await act(async () => { await saving })
    expect(view.value.notifSettings.quota_alerts).toBe(true)
    expect(view.value.notifSettings.newsletter).toBe(true)
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), { user_id: A, ...(write.body as object) })
    const next = pending('notification_preferences', A)
    expect(next.body).toEqual({ types: { newsletter: true, quota_alerts: true } })
    await respond(next, [{ user_id: A, ...(next.body as object) }])
    await act(async () => { await saving })
  })

  it('stops after three CAS conflicts and preserves the draft without claiming success', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), { user_id: A, types: {} })
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    for (let revision = 0; revision < 3; revision += 1) {
      await respond(pending('notification_preferences', A), { user_id: A, types: { newsletter: false, revision } })
      await respond(pending('notification_preferences', A), [])
    }
    await act(async () => { await saving })
    expect(reads.filter(read => read.method === 'PATCH')).toHaveLength(3)
    expect(reads.filter(read => read.method === 'GET')).toHaveLength(4)
    expect(view.value.saving).toBe(false)
    expect(view.value.notifSettings.quota_alerts).toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledOnce()
  })

  it('does not retry an old zero-row acknowledgement after the account changes', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const stored = { user_id: A, types: {} }
    await respond(pending('notification_preferences', A), stored)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), stored)
    const old = pending('notification_preferences', A)
    actor(B); await view.rerender()
    await respond(old, [])
    await act(async () => { await saving })
    expect(old.signal?.aborted).toBe(true)
    expect(reads.filter(read => read.method === 'GET' && read.url.searchParams.get('user_id') === 'eq.' + A)).toHaveLength(2)
    expect(view.value.notifSettings.quota_alerts).toBe(true)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).not.toHaveBeenCalled()
  })

  it('a timed-out conditional write cannot restart its retry loop after a late response', async () => {
    vi.useFakeTimers()
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const stored = { user_id: A, types: {} }
    await respond(pending('notification_preferences', A), stored)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, quota_alerts: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), stored)
    const write = pending('notification_preferences', A)
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); await saving })
    expect(write.signal?.aborted).toBe(true)
    expect(view.value.saving).toBe(false)
    expect(fixture.error).toHaveBeenCalledWith(expect.stringContaining('Actualise pour vérifier'))
    await respond(write, [])
    expect(reads.filter(read => read.method === 'GET')).toHaveLength(2)
    expect(reads.filter(read => read.method === 'PATCH')).toHaveLength(1)
    expect(view.value.notifSettings.quota_alerts).toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
  })
})
