// @vitest-environment jsdom
import React, { act, StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { actor, B, deferred, fixture, json, mount, click, input, seedClientSession, syntheticUser } from './async-lifecycle.test-support'
import ConnectRoot from './connect/ConnectRoot'
import LegalReconsentGate from './shared/LegalReconsentGate'
import type { ConnectAccountSummary } from '@/types/stripe'
import { CURRENT_LEGAL_VERSIONS } from '@/lib/legal/versions'

import AdminPage from '@/app/(dashboard)/dashboard/admin/page'
import AgentsPage from '@/app/(dashboard)/dashboard/agents/page'
import ApiPage from '@/app/(dashboard)/dashboard/api/page'
import BoutiquePage from '@/app/(dashboard)/dashboard/boutique/page'
import CollabPage from '@/app/(dashboard)/dashboard/collab/page'
import ConcoursPage from '@/app/(dashboard)/dashboard/concours/page'
import DailyGiftPage from '@/app/(dashboard)/dashboard/daily-gift/page'
import GratitudePage from '@/app/(dashboard)/dashboard/gratitude/page'
import PartagePage from '@/app/(dashboard)/dashboard/partage/page'
import TiragePage from '@/app/(dashboard)/dashboard/tirage/page'
import CompteConnectPage from '@/app/compte/connect/page'
import ImageTab from './studio/ImageTab'

const summary = (account: string | null = 'acct_synthetic'): ConnectAccountSummary => ({
  has_account: account !== null, stripe_account_id: account, onboarding_stage: 'not_started',
  payouts_enabled: false, charges_enabled: false, disabled_reason: null, kyc_verified_at: null,
  country: 'FR', default_currency: 'eur', currently_due: [], past_due: [],
})
const statusRequests = () => fixture.requests.filter(r => new URL(r.url).pathname === '/api/connect/status')
const onboardingRequests = () => fixture.requests.filter(r => new URL(r.url).pathname === '/api/connect/onboard')

describe('Connect lifecycle with controlled HTTP and inert provider', () => {
  it('finishes the active StrictMode setup even when the cancelled first read finishes later', async () => {
    const first = deferred<Response>()
    let reads = 0
    fixture.transport.mockImplementation(async () => ++reads === 1 ? first.promise : json(summary()))
    const view = await mount(<StrictMode><ConnectRoot>Compte</ConnectRoot></StrictMode>)
    expect(statusRequests()).toHaveLength(2)
    expect(statusRequests()[0].signal.aborted).toBe(true)
    expect(view.container.textContent).toContain('Compte')
    expect(view.container.querySelector('[data-testid="connect-provider"]')).not.toBeNull()
    await act(async () => { first.resolve(json(summary('acct_old'))) })
    expect(fixture.initialize).toHaveBeenCalledTimes(1)
  })
  it('does not initialize after unmount during a status read', async () => {
    const pending = deferred<Response>()
    fixture.transport.mockImplementation(() => pending.promise)
    const view = await mount(<ConnectRoot>Compte</ConnectRoot>)
    await view.unmount()
    await act(async () => { pending.resolve(json(summary())) })
    expect(fixture.initialize).not.toHaveBeenCalled()
    expect(statusRequests()[0].signal.aborted).toBe(true)
  })
  it('checks a fresh status before automatic creation even with a parent summary', async () => {
    const first = deferred<Response>()
    let reads = 0
    fixture.transport.mockImplementation(async request => {
      if (new URL(request.url).pathname === '/api/connect/status') return ++reads === 1 ? first.promise : json(summary(null))
      return json({ stripe_account_id: 'acct_created' })
    })
    const view = await mount(<StrictMode><ConnectRoot initialSummary={summary(null)} allowAutoOnboard>Compte</ConnectRoot></StrictMode>)
    await act(async () => { first.resolve(json(summary(null))) })
    expect(onboardingRequests()).toHaveLength(1)
    expect(fixture.initialize).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-testid="connect-provider"]')).not.toBeNull()
  })
  it('does not initialize after an already-started onboarding response returns to a cleaned-up setup', async () => {
    const onboard = deferred<Response>()
    fixture.transport.mockImplementation(async request => new URL(request.url).pathname.endsWith('/status') ? json(summary(null)) : onboard.promise)
    const view = await mount(<ConnectRoot allowAutoOnboard>Compte</ConnectRoot>)
    expect(onboardingRequests()).toHaveLength(1)
    await view.unmount()
    await act(async () => { onboard.resolve(json({ stripe_account_id: 'acct_created' })) })
    expect(fixture.initialize).not.toHaveBeenCalled()
    expect(onboardingRequests()[0].signal.aborted).toBe(true)
  })
  it('retains the no-account state without starting automatic onboarding', async () => {
    fixture.transport.mockResolvedValue(json(summary(null)))
    const view = await mount(<ConnectRoot>Compte</ConnectRoot>)
    expect(view.container.querySelector('[data-testid="connect-no-account"]')).not.toBeNull()
    expect(onboardingRequests()).toHaveLength(0)
    expect(fixture.initialize).not.toHaveBeenCalled()
  })
  it('shows a status error and never starts a provider instance', async () => {
    fixture.transport.mockResolvedValue(json({ error: 'Statut indisponible' }, 503))
    const view = await mount(<ConnectRoot>Compte</ConnectRoot>)
    expect(view.container.textContent).toContain('Statut indisponible')
    expect(fixture.initialize).not.toHaveBeenCalled()
  })
  it('logs out the owned instance and rejects new session requests after cleanup', async () => {
    fixture.transport.mockImplementation(async () => json(summary()))
    const view = await mount(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    const secret = fixture.initialize.mock.calls[0][0].fetchClientSecret as () => Promise<string>
    await view.unmount()
    expect(fixture.logout).toHaveBeenCalledTimes(1)
    await expect(secret()).rejects.toMatchObject({ name: 'AbortError' })
    expect(statusRequests()).toHaveLength(1)
    expect(fixture.requests.filter(r => r.method === 'POST')).toHaveLength(0)
  })
  it('invalidates a session secret response that finishes after cleanup', async () => {
    const pending = deferred<Response>()
    fixture.transport.mockImplementation(request => new URL(request.url).pathname.endsWith('/status') ? Promise.resolve(json(summary())) : pending.promise)
    const view = await mount(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    const secret = fixture.initialize.mock.calls[0][0].fetchClientSecret as () => Promise<string>
    const result = secret()
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await view.unmount()
    pending.resolve(json({ client_secret: 'synthetic-secret' }))
    await rejected
    expect(fixture.requests.find(r => r.method === 'POST')!.signal.aborted).toBe(true)
  })
  it('replaces an old actor instance after A to B even when the parent summary is stale', async () => {
    fixture.transport.mockImplementation(async () => json(summary('acct_B')))
    const view = await mount(<ConnectRoot initialSummary={summary('acct_A')}>Compte</ConnectRoot>)
    actor(B, 'Bob')
    await view.render(<ConnectRoot initialSummary={summary('acct_A')}>Compte</ConnectRoot>)
    expect(fixture.logout).toHaveBeenCalledTimes(1)
    expect(statusRequests().length).toBeGreaterThan(0)
    expect(fixture.initialize).toHaveBeenCalledTimes(2)
  })
  it('removes a ready provider immediately on sign-out', async () => {
    fixture.transport.mockImplementation(async () => json(summary()))
    const view = await mount(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    fixture.auth.user = null
    await view.render(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    expect(view.container.querySelector('[data-testid="connect-provider"]')).toBeNull()
    expect(fixture.logout).toHaveBeenCalledTimes(1)
  })
  it('rejects the previous actor session callback after A to B', async () => {
    fixture.transport.mockImplementation(async request => new URL(request.url).pathname.endsWith('/status') ? json(summary()) : json({ client_secret: 'synthetic-secret' }))
    const view = await mount(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    const secret = fixture.initialize.mock.calls[0][0].fetchClientSecret as () => Promise<string>
    actor(B, 'Bob')
    await view.render(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    await expect(secret()).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('does not recreate a provider for a new summary object of the same account', async () => {
    fixture.transport.mockImplementation(async () => json(summary()))
    const view = await mount(<ConnectRoot initialSummary={summary()}>Compte</ConnectRoot>)
    await view.render(<ConnectRoot initialSummary={{ ...summary(), onboarding_stage: 'verified' }}>Compte</ConnectRoot>)
    expect(fixture.initialize).toHaveBeenCalledTimes(1)
  })
})

describe('legal acceptance follows the current actor', () => {
  const complete = ['cgu', 'cgv', 'confidentialite'].map(doc_type => ({
    doc_type, version: CURRENT_LEGAL_VERSIONS[doc_type as keyof typeof CURRENT_LEGAL_VERSIONS],
  }))
  it('does not render the previous actor’s pending documents while the next read is pending', async () => {
    const next = deferred<Response>()
    fixture.transport.mockResolvedValueOnce(json([])).mockImplementation(() => next.promise)
    const view = await mount(<LegalReconsentGate />)
    expect(view.container.textContent).toContain('Mise à jour')
    actor(B, 'Bob')
    await view.render(<LegalReconsentGate />)
    expect(view.container.textContent).toBe('')
    await act(async () => { next.resolve(json(complete)) })
    expect(view.container.textContent).toBe('')
  })
  it('ignores a previous actor’s late read', async () => {
    const old = deferred<Response>()
    fixture.transport.mockImplementationOnce(() => old.promise).mockResolvedValue(json(complete))
    const view = await mount(<LegalReconsentGate />)
    actor(B, 'Bob')
    await view.render(<LegalReconsentGate />)
    await act(async () => { old.resolve(json([])) })
    expect(view.container.textContent).toBe('')
  })
  it('hides pending documents immediately after sign-out', async () => {
    fixture.transport.mockResolvedValue(json([]))
    const view = await mount(<LegalReconsentGate />)
    expect(view.container.textContent).toContain('Mise à jour')
    fixture.auth.user = null
    await view.render(<LegalReconsentGate />)
    expect(view.container.textContent).toBe('')
  })
})

describe('page resources expose failures and invalidate old actors', () => {
  it.each([
    ['admin', AdminPage], ['agents', AgentsPage], ['api', ApiPage], ['boutique', BoutiquePage],
    ['collab', CollabPage], ['concours', ConcoursPage], ['daily-gift', DailyGiftPage],
    ['gratitude', GratitudePage], ['partage', PartagePage], ['tirage', TiragePage],
    ['connect-hub', CompteConnectPage], ['image-history', ImageTab],
  ] as const)('%s shows an explicit read error and retry', async (name, Page) => {
    fixture.auth.isSuperAdmin = true
    if (name === 'admin') (fixture.auth.profile as { role: string }).role = 'super_admin'
    fixture.transport.mockImplementation(async request => new URL(request.url).pathname === '/auth/v1/user'
      ? json(syntheticUser()) : json({ message: 'synthetic unavailable', code: '42501' }, 403))
    if (name === 'image-history') await seedClientSession()
    const view = await mount(<Page />)
    const alert = view.container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    if (name === 'connect-hub') expect(view.container.textContent).toContain('Actualiser')
    else expect(alert?.textContent).toContain('Réessayer')
    expect(fixture.requests.length).toBeGreaterThan(0)
    expect(fixture.initialize).not.toHaveBeenCalled()
    expect(fixture.success).not.toHaveBeenCalled()
  })
  it('keeps the current gratitude entries after an aborted old read resolves', async () => {
    const old = deferred<Response>()
    fixture.transport.mockImplementationOnce(() => old.promise).mockImplementation(async () =>
      json({ entries: [{ id: 'B-entry', content: 'Entrée Bob', created_at: '2026-11-11T12:00:00Z' }], streak: 1 }))
    const view = await mount(<GratitudePage />)
    actor(B, 'Bob'); await view.render(<GratitudePage />)
    expect(fixture.requests[0].signal.aborted).toBe(true)
    await act(async () => { old.resolve(json({ entries: [{ id: 'A-entry', content: 'Entrée Alice', created_at: '2026-11-11T12:00:00Z' }], streak: 1 })) })
    expect(view.container.textContent).toContain('Entrée Bob')
    expect(view.container.textContent).not.toContain('Entrée Alice')
  })
  it('does not toast or erase the new actor draft after an old gratitude write resolves', async () => {
    const old = deferred<Response>()
    fixture.transport.mockImplementation(async request => request.method === 'POST' ? old.promise : json({ entries: [], streak: 0 }))
    const view = await mount(<GratitudePage />)
    await input(view.container.querySelector('[data-testid="gratitude-input"]'), 'Envoi Alice')
    await click(view.container.querySelector('[data-testid="btn-gratitude-add"]'))
    actor(B, 'Bob'); await view.render(<GratitudePage />)
    await input(view.container.querySelector('[data-testid="gratitude-input"]'), 'Brouillon Bob')
    await act(async () => { old.resolve(json({ entry: { id: 'old', content: 'Envoi Alice', created_at: '2026-11-11T12:00:00Z' } })) })
    expect((view.container.querySelector('[data-testid="gratitude-input"]') as HTMLTextAreaElement).value).toBe('Brouillon Bob')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(view.container.textContent).not.toContain('Envoi Alice')
  })
  it('does not generate a new API key after a resolved deactivation refusal', async () => {
    (fixture.auth.profile as { plan: string }).plan = 'complete_pro'
    fixture.transport.mockImplementation(async request => {
      const path = new URL(request.url).pathname
      if (request.method === 'PATCH') return json({ message: 'denied', code: '42501' }, 403)
      if (path === '/rest/v1/api_keys') return json([{ id: 'key-A', key_prefix: 'synthetic_', is_active: true, created_at: '2026-01-01T00:00:00Z', last_used_at: null }])
      if (path === '/rest/v1/api_logs') return new Response(null, { headers: { 'Content-Range': '*/0' } })
      if (path === '/api/admin/api-keys/generate') return json({ key: 'synthetic-new-key' })
      fixture.unexpected.push(request.url); throw new Error('Unexpected request')
    })
    const view = await mount(<ApiPage />)
    await click(view.container.querySelector('[data-testid="regen-key-btn"]'))
    await click(view.container.querySelector('[data-testid="confirm-regen"]'))
    expect(fixture.requests.some(request => new URL(request.url).pathname === '/api/admin/api-keys/generate')).toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalled()
  })
})

describe('collaboration mutation errors', () => {
  it('does not claim full creation when adding the admin membership is refused', async () => {
    fixture.transport.mockImplementation(async request => {
      const path = new URL(request.url).pathname
      if (request.method === 'GET') return json([])
      if (path === '/rest/v1/collab_spaces') return json({ id: 'space-new', owner_id: 'actor', name: 'Mon espace', created_at: '2026-01-01T00:00:00Z' })
      if (path === '/rest/v1/collab_members') return json({ message: 'denied', code: '42501' }, 403)
      fixture.unexpected.push(request.url); throw new Error('Unexpected request')
    })
    const view = await mount(<CollabPage />)
    await click(view.container.querySelector('[data-testid="create-space-btn"]'))
    await input(view.container.querySelector('[data-testid="space-name-input"]'), 'Mon espace')
    await click(view.container.querySelector('[data-testid="create-space-confirm"]'))
    expect(fixture.requests.some(request => request.method === 'POST' && new URL(request.url).pathname === '/rest/v1/collab_members')).toBe(true)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalled()
  })
})

it('does not claim a points credit when the tracking helper cannot attest its writes', async () => {
  const opened = vi.spyOn(window, 'open').mockReturnValue(null)
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? json([]) : json({ message: 'denied', code: '42501' }, 403))
  const view = await mount(<PartagePage />)
  await click(view.container.querySelector('.grid.grid-cols-2 button'))
  expect(opened).toHaveBeenCalledTimes(1)
  expect(fixture.requests.filter(request => request.method === 'POST')).toHaveLength(2)
  expect(fixture.success).not.toHaveBeenCalled()
  expect(fixture.info).toHaveBeenCalledWith('Ouverture du partage demandée. Vérifie ton solde pour les points.')
  expect(fixture.requests.filter(request => request.method === 'GET').length).toBeGreaterThan(1)
})

it('does not publish an old actor purchase error after its response body finishes', async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller } })
  fixture.transport.mockImplementation(async request => request.method === 'POST'
    ? new Response(stream, { status: 403, headers: { 'Content-Type': 'application/json' } }) : json({ balance: 5000 }))
  const view = await mount(<BoutiquePage />)
  await click([...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('Obtenir')) ?? null)
  expect(fixture.requests.filter(request => request.method === 'POST')).toHaveLength(1)
  actor(B, 'Bob'); await view.render(<BoutiquePage />)
  await act(async () => { body.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'Refus ancien acteur' }))); body.close() })
  expect(fixture.error).not.toHaveBeenCalled()
  expect(fixture.success).not.toHaveBeenCalled()
})
