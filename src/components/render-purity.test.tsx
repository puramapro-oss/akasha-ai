// @vitest-environment jsdom
import React, { act, StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { actor, B, fixture, input, mount, click, profile, deferred, json } from './async-lifecycle.test-support'
import Confetti from './shared/Confetti'
import SpiritualLayer from './shared/SpiritualLayer'
import EditWorkflowModal from './automation/EditWorkflowModal'
import ProfilePage from '@/app/(dashboard)/dashboard/profile/page'
import OnboardingPage from '@/app/onboarding/page'
import DailyGiftPage from '@/app/(dashboard)/dashboard/daily-gift/page'
import type { Workflow, WorkflowStep } from '@/types/automation'

const workflow = (id = 'workflow-A'): Workflow => ({ id, name: 'Original',
  status: 'draft', last_run: null, steps: [], created_at: '2026-01-01T00:00:00Z' })
const editorProps = () => ({ workflow: workflow(), onClose: vi.fn(),
  onSave: vi.fn<(id: string, name: string, steps: WorkflowStep[]) => Promise<boolean>>().mockResolvedValue(true),
  onDelete: vi.fn(async () => true) })
const particles = (container: HTMLElement) => [...container.querySelectorAll('.animate-confetti')].map(x => x.getAttribute('style'))

describe('render purity and animation lifecycle', () => {
  it('keeps all particle styles stable through a parent rerender', async () => {
    vi.useFakeTimers()
    const view = await mount(<StrictMode><Confetti active /></StrictMode>)
    const before = particles(view.container)
    expect(before).toHaveLength(50)
    await view.render(<StrictMode><Confetti active /></StrictMode>)
    expect(particles(view.container)).toEqual(before)
  })
  it('expires once, restarts only after a new activation, and clears its timer', async () => {
    vi.useFakeTimers()
    const view = await mount(<Confetti active duration={1000} />)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(particles(view.container)).toHaveLength(0)
    await view.render(<Confetti active={false} duration={1000} />)
    await view.render(<Confetti active duration={1000} />)
    expect(particles(view.container)).toHaveLength(50)
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not replay an expired burst on an unchanged active prop', async () => {
    vi.useFakeTimers()
    const view = await mount(<Confetti active duration={100} />)
    await act(async () => { vi.advanceTimersByTime(100) })
    await view.render(<Confetti active duration={100} />)
    expect(particles(view.container)).toHaveLength(0)
  })
  it('selects an affirmation only at the existing presentation deadline', async () => {
    vi.useFakeTimers()
    const view = await mount(<StrictMode><SpiritualLayer /></StrictMode>)
    expect(fixture.affirmation).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(fixture.affirmation).toHaveBeenCalledTimes(1)
    expect(view.container.textContent).toContain('Une affirmation')
  })
  it('cancels presentation on unmount', async () => {
    vi.useFakeTimers()
    const view = await mount(<SpiritualLayer />)
    await view.unmount()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(fixture.affirmation).not.toHaveBeenCalled()
    expect(fixture.seen).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels integration and confetti on unmount, without marking a later session', async () => {
    vi.useFakeTimers()
    const view = await mount(<SpiritualLayer />)
    await act(async () => { vi.advanceTimersByTime(1500) })
    await click(view.container.querySelector('[data-testid="btn-integrate-affirmation"]'))
    await view.unmount()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(fixture.seen).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('drafts follow the actor and preserve user edits', () => {
  it('prefills a profile that arrives after its actor', async () => {
    fixture.auth.profile = null
    const view = await mount(<ProfilePage />)
    expect(view.container.querySelector('#displayName')).toBeNull()
    fixture.auth.profile = profile()
    await view.render(<ProfilePage />)
    expect((view.container.querySelector('#displayName') as HTMLInputElement).value).toBe('Alice')
  })
  it('preserves a profile draft through null and a refreshed profile for the same actor', async () => {
    const view = await mount(<ProfilePage />)
    await input(view.container.querySelector('#displayName'), 'Brouillon')
    fixture.auth.profile = null
    await view.render(<ProfilePage />)
    fixture.auth.profile = profile(undefined, 'Nouvelle donnée serveur')
    await view.render(<ProfilePage />)
    expect((view.container.querySelector('#displayName') as HTMLInputElement).value).toBe('Brouillon')
  })
  it('preserves intentional empty text and resets the draft for a different actor', async () => {
    const view = await mount(<ProfilePage />)
    await input(view.container.querySelector('#displayName'), '')
    fixture.auth.profile = profile(undefined, 'Serveur')
    await view.render(<ProfilePage />)
    expect((view.container.querySelector('#displayName') as HTMLInputElement).value).toBe('')
    fixture.auth.profile = profile(B, 'Profil incompatible')
    await view.render(<ProfilePage />)
    expect(view.container.textContent).not.toContain('Profil incompatible')
    actor(B, 'Bob')
    await view.render(<ProfilePage />)
    expect((view.container.querySelector('#displayName') as HTMLInputElement).value).toBe('Bob')
  })
  it('does not replace an onboarding edit on a same-actor refetch', async () => {
    const view = await mount(<OnboardingPage />)
    await input(view.container.querySelector('[data-testid="onboarding-pseudo"]'), 'Mon choix')
    fixture.auth.profile = profile(undefined, 'Serveur')
    await view.render(<OnboardingPage />)
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('Mon choix')
  })
  it('initializes onboarding when profile data arrives, then resets on actor change', async () => {
    fixture.auth.profile = null; fixture.auth.loading = true
    const view = await mount(<OnboardingPage />)
    fixture.auth.profile = profile(); fixture.auth.loading = false
    await view.render(<OnboardingPage />)
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('Alice')
    actor(B, 'Bob')
    await view.render(<OnboardingPage />)
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('Bob')
  })
  it('keeps a workflow draft for the same id and initializes a changed workflow', async () => {
    const props = editorProps()
    const view = await mount(<EditWorkflowModal {...props} />)
    await input(view.container.querySelector('[data-testid="editor-name-input"]'), 'Brouillon workflow')
    await view.render(<EditWorkflowModal {...props} workflow={{ ...workflow(), name: 'Refetch' }} />)
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('Brouillon workflow')
    await view.render(<EditWorkflowModal {...props} workflow={{ ...workflow('workflow-B'), name: 'Autre' }} />)
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('Autre')
  })
  it('creates distinct step identities only when adding steps and preserves them at save', async () => {
    const props = editorProps()
    const view = await mount(<EditWorkflowModal {...props} />)
    await click(view.container.querySelector('[data-testid="add-step-ai"]'))
    await click(view.container.querySelector('[data-testid="add-step-ai"]'))
    await click(view.container.querySelector('[data-testid="save-workflow-btn"]'))
    const steps = props.onSave.mock.calls[0][2]
    expect(steps).toHaveLength(2)
    expect(new Set(steps.map(step => step.id)).size).toBe(2)
    expect(steps.every(step => step.type === 'ai')).toBe(true)
  })
})

describe('mutations respect resolved database errors and invalidated identities', () => {
  const saveProfileButton = (container: HTMLElement) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Enregistrer')) ?? null
  const database = (patch: () => Promise<Response>) => fixture.transport.mockImplementation(async request => {
    if (request.method === 'PATCH') return patch()
    if (new URL(request.url).pathname === '/rest/v1/user_badges') return Response.json([], { headers: { 'Content-Range': '*/0' } })
    fixture.unexpected.push(request.url); throw new Error('Unexpected database request')
  })
  it('keeps onboarding open when the real SDK resolves with a database error', async () => {
    database(async () => json({ message: 'denied', code: '42501' }, 403))
    const view = await mount(<OnboardingPage />)
    await click(view.container.querySelector('[data-testid="finish-onboarding"]'))
    expect(fixture.replace).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledWith('Erreur lors de la sauvegarde')
  })
  it('does not navigate when the previous actor onboarding update finishes', async () => {
    const pending = deferred<Response>(); database(() => pending.promise)
    const view = await mount(<OnboardingPage />)
    await click(view.container.querySelector('[data-testid="finish-onboarding"]'))
    actor(B, 'Bob'); await view.render(<OnboardingPage />)
    await act(async () => { pending.resolve(new Response(null, { status: 204 })) })
    expect(fixture.replace).not.toHaveBeenCalled()
  })
  it('does not toast or refetch when a previous actor profile update finishes', async () => {
    const pending = deferred<Response>(); database(() => pending.promise)
    const previousRefetch = fixture.auth.refetch
    const view = await mount(<ProfilePage />)
    await click(saveProfileButton(view.container))
    actor(B, 'Bob'); await view.render(<ProfilePage />)
    await act(async () => { pending.resolve(new Response(null, { status: 204 })) })
    expect(fixture.success).not.toHaveBeenCalled()
    expect(previousRefetch).not.toHaveBeenCalled()
    expect(fixture.auth.refetch).not.toHaveBeenCalled()
  })
  it('keeps a profile database refusal visible without claiming success', async () => {
    database(async () => json({ message: 'denied', code: '42501' }, 403))
    const view = await mount(<ProfilePage />)
    await click(saveProfileButton(view.container))
    expect(fixture.error).toHaveBeenCalledWith('Erreur lors de la sauvegarde')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.auth.refetch).not.toHaveBeenCalled()
  })
  it('does not close a replacement workflow after an old save resolves', async () => {
    const pending = deferred<boolean>(); const props = editorProps()
    props.onSave.mockImplementation(() => pending.promise)
    const view = await mount(<EditWorkflowModal {...props} />)
    await click(view.container.querySelector('[data-testid="save-workflow-btn"]'))
    await view.render(<EditWorkflowModal {...props} workflow={workflow('workflow-B')} />)
    await act(async () => { pending.resolve(true) })
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('keeps the editor open after a refused deletion', async () => {
    const props = editorProps(); props.onDelete.mockResolvedValue(false)
    const view = await mount(<EditWorkflowModal {...props} />)
    await click(view.container.querySelector('[data-testid="delete-workflow-btn"]'))
    expect(props.onClose).not.toHaveBeenCalled()
  })
})

describe('daily chest cancellation and editor errors', () => {
  it('cancels the existing shake timer before a new actor can issue a reward POST', async () => {
    vi.useFakeTimers()
    fixture.transport.mockImplementation(async () => json({ already_opened: false, gift: null, streak: 0 }))
    const view = await mount(<DailyGiftPage />)
    await click([...view.container.querySelectorAll('button')].find(button => /ouvrir/i.test(button.textContent ?? '')) ?? null)
    actor(B, 'Bob'); await view.render(<DailyGiftPage />)
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(fixture.requests.filter(request => request.method === 'POST')).toHaveLength(0)
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears both reward presentation timers after a completed opening is unmounted', async () => {
    vi.useFakeTimers()
    fixture.transport.mockImplementation(async request => request.method === 'POST'
      ? json({ gift: { id: 'gift', gift_type: 'points', gift_value: '100', label: '100 points' } })
      : json({ already_opened: false, gift: null, streak: 0 }))
    const view = await mount(<DailyGiftPage />)
    await click([...view.container.querySelectorAll('button')].find(button => /ouvrir/i.test(button.textContent ?? '')) ?? null)
    await act(async () => { vi.advanceTimersByTime(1200) })
    expect(fixture.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    expect(fixture.success).toHaveBeenCalledWith('Tu as gagne : 100 points')
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['save', 'delete'] as const)('shows a rejected workflow %s and keeps its editor open', async kind => {
    const props = editorProps()
    if (kind === 'save') props.onSave.mockRejectedValue(new Error('synthetic failure'))
    else props.onDelete.mockRejectedValue(new Error('synthetic failure'))
    const view = await mount(<EditWorkflowModal {...props} />)
    await click(view.container.querySelector('[data-testid="' + kind + '-workflow-btn"]'))
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()
  })
})

describe('profile read failures keep verified actor drafts usable', () => {
  it('shows an initial auth profile error and retries through that same auth instance', async () => {
    fixture.auth.profile = null; fixture.auth.error = 'Profil indisponible'; fixture.auth.loading = false
    const refetch = fixture.auth.refetch
    const view = await mount(<ProfilePage />)
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Profil indisponible')
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'Réessayer') ?? null)
    expect(refetch).toHaveBeenCalledTimes(1)
  })
  it('keeps the edited profile after a successful SDK write and a refused auth refresh', async () => {
    const pending = deferred<void>(); const refetch = vi.fn(() => pending.promise); fixture.auth.refetch = refetch
    fixture.transport.mockImplementation(async request => request.method === 'PATCH'
      ? new Response(null, { status: 204 }) : Response.json([], { headers: { 'Content-Range': '*/0' } }))
    const view = await mount(<ProfilePage />)
    await input(view.container.querySelector('#displayName'), 'Nom conservé')
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('Enregistrer')) ?? null)
    expect(refetch).toHaveBeenCalledTimes(1)
    fixture.auth.profile = null; fixture.auth.error = 'Actualisation impossible'; fixture.auth.loading = false
    await view.render(<ProfilePage />)
    await act(async () => { pending.resolve() })
    expect((view.container.querySelector('#displayName') as HTMLInputElement | null)?.value).toBe('Nom conservé')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Actualisation impossible')
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'Réessayer') ?? null)
    expect(refetch).toHaveBeenCalledTimes(2)
  })
})
