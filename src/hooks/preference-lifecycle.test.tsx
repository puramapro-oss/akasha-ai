// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  A, B, actor, fail, fixture, mountHook, mountComponent, pending, reads, respond,
} from './lifecycle-recovery.test-support'
import { useAwakening } from './useAwakening'
import { useSettingsData } from './useSettingsData'
import { useTheme } from './useTheme'
import SettingsPage from '@/app/(dashboard)/dashboard/settings/page'

describe('settings drafts and external preferences', () => {
  it('a same-actor profile refresh preserves a dirty profile draft', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await act(async () => view.value.setProfileForm(previous => ({ ...previous, bio: 'Unsaved draft' })))
    actor(A, { bio: 'Remote refreshed bio', display_name: 'Alice refreshed' })
    await view.rerender()
    expect(view.value.profileForm.bio).toBe('Unsaved draft')
    expect(view.value.profileForm.display_name).toBe('Alice refreshed')
  })

  it('a profile refresh updates pristine fields', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    actor(A, { bio: 'New server bio' }); await view.rerender()
    expect(view.value.profileForm.bio).toBe('New server bio')
  })

  it('account change cannot transfer notification or profile drafts', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await act(async () => {
      view.value.setProfileForm(previous => ({ ...previous, bio: 'Private A draft' }))
      view.value.setNotifSettings(previous => ({ ...previous, newsletter: true }))
    })
    actor(B); await view.rerender()
    expect(view.value.profileForm.bio).toBe('')
    expect(view.value.profileForm.display_name).toBe('Bob')
    expect(view.value.notifSettings.newsletter).toBe(false)
    expect(view.container.textContent).not.toContain('Private A draft')
  })

  it('profile absence after actor change does not keep the prior draft', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await act(async () => view.value.setProfileForm(previous => ({ ...previous, bio: 'Private A draft' })))
    fixture.user = { id: B }; fixture.profile = null
    await view.rerender()
    expect(view.value.profileForm).toEqual({ display_name: '', pseudo: '', bio: '' })
  })

  it('an old save completion cannot publish a success into the next actor', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveProfile() })
    const old = pending('profiles', A)
    actor(B); await view.rerender()
    await respond(old, null)
    await act(async () => { await saving })
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.refresh).not.toHaveBeenCalled()
    expect(view.value.saving).toBe(false)
  })

  it('a denied current profile save ends busy and never announces success', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveProfile() })
    await fail(pending('profiles', A))
    await act(async () => { await saving })
    expect(view.value.saving).toBe(false)
    expect(fixture.error).toHaveBeenCalled()
    expect(fixture.success).not.toHaveBeenCalled()
  })

  it('the payments refresh function stays stable on an equivalent render', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const before = view.value.fetchPayments
    actor(A); await view.rerender()
    expect(view.value.fetchPayments).toBe(before)
  })

  it('denied local storage does not crash theme hydration', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied') })
    function useProbe() { return useTheme() }
    const view = await mountHook(useProbe)
    expect(view.value.theme).toBe('dark')
  })

  it('a browser storage event refreshes an external theme preference', async () => {
    function useProbe() { return useTheme() }
    const view = await mountHook(useProbe)
    await act(async () => {
      localStorage.setItem('akasha_theme', 'oled')
      window.dispatchEvent(new StorageEvent('storage', { key: 'akasha_theme', newValue: 'oled' }))
    })
    expect(view.value.theme).toBe('oled')
  })

  it('awakening level is derived from the current profile', async () => {
    function useProbe() { return useAwakening() }
    const view = await mountHook(useProbe)
    expect(view.value.awakeningLevel).toBe(1)
    actor(B, { level: 21 }); await view.rerender()
    expect(view.value.awakeningLevel).toBe(21)
    expect(view.value.levelInfo.name).toBe('Illumine')
  })

  it('denied session storage does not prevent marking an affirmation seen', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied') })
    function useProbe() { return useAwakening() }
    const view = await mountHook(useProbe)
    await act(async () => view.value.markAffirmationSeen())
    expect(view.value.affirmationSeen).toBe(true)
  })
})

describe('notification preferences persist through their existing actor-owned table', () => {
  it('does not announce a save before a database acknowledgement', async () => {
    vi.useFakeTimers()
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await act(async () => { void view.value.handleSaveNotifs() })
    await act(async () => { await vi.advanceTimersByTimeAsync(301) })
    expect(fixture.success).not.toHaveBeenCalled()
  })

  it('roundtrips types while preserving unknown keys and other preference columns', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    const stored = { user_id: A, types: { newsletter: true, future_kind: { enabled: false } } }
    await respond(pending('notification_preferences', A), stored)
    expect(view.value.notifSettings.newsletter).toBe(true)
    await act(async () => view.value.setNotifSettings(previous => ({ ...previous, newsletter: false })))
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await respond(pending('notification_preferences', A), stored)
    const write = pending('notification_preferences')
    expect(write.method).toBe('POST')
    expect(write.url.searchParams.get('on_conflict')).toBe('user_id')
    expect(write.body).toEqual({ user_id: A, types: {
      ...view.value.notifSettings, future_kind: { enabled: false },
    } })
    const saved = write.body as { user_id: string; types: Record<string, unknown> }
    await respond(write, saved)
    await act(async () => { await saving })
    expect(fixture.success).toHaveBeenCalledOnce()
    await view.unmount()
    function useRemount() { return useSettingsData() }
    const remounted = await mountHook(useRemount)
    await respond(pending('notification_preferences', A), saved)
    expect(remounted.value.notifSettings.newsletter).toBe(false)
  })

  it('a denied preferences save is an explicit failure with no success message', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), { user_id: A, types: {} })
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    await fail(pending('notification_preferences', A))
    await act(async () => { await saving })
    expect(fixture.error).toHaveBeenCalled()
    expect(fixture.success).not.toHaveBeenCalled()
    expect(view.value.saving).toBe(false)
  })

  it('switching account during the read cannot send the old preferences mutation', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await respond(pending('notification_preferences', A), { user_id: A, types: {} })
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveNotifs() })
    const old = pending('notification_preferences', A)
    actor(B); await view.rerender()
    await respond(old, { user_id: A, types: {} })
    await act(async () => { await saving })
    expect(fixture.success).not.toHaveBeenCalled()
    expect(view.value.saving).toBe(false)
    expect(view.value.notifSettings.newsletter).toBe(false)
    expect(reads.filter(read => read.method === 'POST')).toHaveLength(0)
  })
})


describe('canonical confirmation and preference compatibility', () => {
  it('retains the submitted form if the subsequent auth profile refresh fails, then accepts a confirmed pristine refresh', async () => {
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    await act(async () => view.value.setProfileForm(previous => ({ ...previous, bio: 'Saved bio' })))
    const submitted = { ...view.value.profileForm }
    fixture.refresh.mockImplementationOnce(async () => { fixture.profile = null; fixture.authError = 'Profil indisponible' })
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveProfile() })
    await respond(pending('profiles', A), null)
    await act(async () => { await saving })
    await view.rerender()
    expect(view.value.profileForm).toEqual(submitted)
    expect(view.value.error?.message).toBe('Profil indisponible')
    fixture.refresh.mockImplementationOnce(async () => { fixture.authError = null; actor(A, { bio: 'Saved bio' }) })
    const page = await mountComponent(SettingsPage)
    const retry = [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Réessayer le chargement'))!
    expect(retry).toBeTruthy()
    await act(async () => retry.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(fixture.refresh).toHaveBeenCalledTimes(2)
    const refreshedPreferences = reads.filter(read => read.url.pathname.endsWith('/notification_preferences')).at(-1)!
    await respond(refreshedPreferences, { user_id: A, types: {} })
    await view.rerender()
    actor(A, { bio: 'Later canonical bio' }); await view.rerender()
    expect(view.value.profileForm.bio).toBe('Later canonical bio')
  })

  it('prefers the canonical theme key without deleting the legacy choice', async () => {
    localStorage.setItem('akasha_theme', 'oled')
    localStorage.setItem('akasha-theme', 'light')
    function useProbe() { return useTheme() }
    const view = await mountHook(useProbe)
    expect(view.value.theme).toBe('light')
    expect(localStorage.getItem('akasha_theme')).toBe('oled')
    await act(async () => view.value.setTheme('dark'))
    expect(localStorage.getItem('akasha-theme')).toBe('dark')
    expect(localStorage.getItem('akasha_theme')).toBe('oled')
  })

  it('keeps an explicit theme usable when storage writes are refused', async () => {
    function useProbe() { return useTheme() }
    const view = await mountHook(useProbe)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied') })
    await act(async () => view.value.setTheme('light'))
    expect(view.value.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: null })))
  })

  it('a stalled save stops busy, aborts and asks for verification without retrying the write', async () => {
    vi.useFakeTimers()
    function useProbe() { return useSettingsData() }
    const view = await mountHook(useProbe)
    let saving!: Promise<void>
    await act(async () => { saving = view.value.handleSaveProfile() })
    const write = pending('profiles', A)
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); await saving })
    expect(write.signal?.aborted).toBe(true)
    expect(view.value.saving).toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledWith(expect.stringContaining('Actualise pour vérifier'))
    expect(reads.filter(read => read.method === 'PATCH')).toHaveLength(1)
  })
})
