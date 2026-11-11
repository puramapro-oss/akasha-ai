// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  fixture, container, A, B, C, identity, own, match,
  deferred, responseFor, mount, flush, button, input, type, click, switchSession,
  actions, prepareAction, unmountAndReset, api, type ApiCall,
} from './page.test-support'

describe('Entraide reads, drafts and authentication epochs', () => {
  it('cancels old profile/matching loads through A -> B -> A', async () => {
    const oldProfile = deferred<Response>()
    const oldMatches = deferred<Response>()
    let heldProfile = false
    let heldMatches = false
    api.override = call => {
      if (call.actor === A && call.method === 'GET' && call.route === 'profile' && !heldProfile) {
        heldProfile = true; return oldProfile.promise
      }
      if (call.actor === A && call.method === 'GET' && call.route === 'matches' && !heldMatches) {
        heldMatches = true; return oldMatches.promise
      }
    }
    await mount()
    await switchSession(identity(B, 'token-B'))
    api.profiles[A] = own(A, 'new A state')
    await switchSession(identity())
    expect(input('#entraide-offered').value).toBe('new A state')
    oldProfile.resolve(Response.json({ profile: own(A, 'stale A state') }))
    oldMatches.resolve(Response.json({ matches: [match(C)], scanned_profiles: 1, truncated: false }))
    await flush()
    expect(input('#entraide-offered').value).toBe('new A state')
    expect(container.textContent).not.toContain('Expert ' + C.slice(0, 8))
    expect(container.textContent).toContain('Expert ' + B.slice(0, 8))
  })
  it('preserves profile and mission drafts across token refresh and rejects a late prior-token match', async () => {
    await mount()
    await type('#entraide-offered', 'profile draft')
    await click('Résolutions Collectives')
    await type('input[placeholder="Titre de la résolution"]', 'mission draft')
    await click('Mon Profil')
    const oldMatches = deferred<Response>()
    api.override = call => call.route === 'matches' &&
      new Headers(call.init.headers).get('authorization') === 'Bearer token-A2' ? oldMatches.promise : undefined
    await switchSession(identity(A, 'token-A2'), 'TOKEN_REFRESHED')
    await switchSession(identity(A, 'token-A3'), 'TOKEN_REFRESHED')
    expect(input('#entraide-offered').value).toBe('profile draft')
    oldMatches.resolve(Response.json({ matches: [match(C)], scanned_profiles: 1, truncated: false }))
    await flush()
    expect(container.textContent).not.toContain('Expert ' + C.slice(0, 8))
    await click('Résolutions Collectives')
    expect(input('input[placeholder="Titre de la résolution"]').value).toBe('mission draft')
  })
  it('does not dispatch a stale A mutation using SDK session B before React re-renders', async () => {
    await mount()
    fixture.state.sdkSession = identity(B, 'token-B')
    await click('Enregistrer mon profil')
    expect(api.calls.filter(call => call.method === 'POST')).toHaveLength(0)
    expect(fixture.success).not.toHaveBeenCalled()
  })
  it('keeps a profile draft edited while its earlier save is in flight', async () => {
    await mount()
    await type('#entraide-offered', 'first draft')
    const pending = deferred<Response>()
    let sent!: ApiCall
    api.override = call => { if (call.method === 'POST') { sent = call; return pending.promise } }
    await click('Enregistrer mon profil')
    await type('#entraide-offered', 'newer draft')
    pending.resolve(responseFor(sent))
    await flush()
    expect(input('#entraide-offered').value).toBe('newer draft')
    expect(fixture.success).toHaveBeenCalledTimes(1)
  })
  it('does not clear a newer mission draft when creation of the previous draft succeeds', async () => {
    await prepareAction(actions.find(action => action.name === 'createMission')!)
    const pending = deferred<Response>()
    let sent!: ApiCall
    api.override = call => { if (call.method === 'POST') { sent = call; return pending.promise } }
    await click('Créer')
    await type('input[placeholder="Titre de la résolution"]', 'next mission draft')
    pending.resolve(responseFor(sent))
    await flush()
    expect(input('input[placeholder="Titre de la résolution"]').value).toBe('next mission draft')
    expect(fixture.success).toHaveBeenCalledTimes(1)
  })
  it('preserves failed-save drafts and never toasts success or leaks raw errors', async () => {
    await mount()
    await type('#entraide-offered', 'keep this draft')
    api.override = call => call.method === 'POST' ? Response.json({ error: 'private database detail' }, { status: 503 }) : undefined
    await click('Enregistrer mon profil')
    expect(input('#entraide-offered').value).toBe('keep this draft')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledWith('Service Entraide indisponible. Réessayez.')
  })
  it('supports creating an absent own profile without querying profiles from the browser', async () => {
    api.profiles[A] = null
    api.matches[A] = { matches: [], scanned_profiles: 0, truncated: false }
    await mount()
    expect(input('#entraide-offered').value).toBe('')
    expect(button('Enregistrer mon profil').disabled).toBe(false)
    await type('#entraide-offered', 'new profile skill')
    await click('Enregistrer mon profil')
    expect(fixture.success).toHaveBeenCalledTimes(1)
    expect(fixture.state.reads.some(read => read.table === 'entraide_profils')).toBe(false)
  })
  it('reports profile and matching errors and permits an explicit retry', async () => {
    api.override = call => call.method === 'GET' ? Response.json({ error: 'private failure' }, { status: 503 }) : undefined
    await mount()
    expect(container.textContent).toContain('Votre profil est indisponible')
    expect(container.textContent).toContain('Les correspondances sont indisponibles')
    expect(button('Enregistrer mon profil').disabled).toBe(true)
    expect(container.textContent).not.toContain('private failure')
    api.override = undefined
    await click('Actualiser les données')
    expect(input('#entraide-offered').value).toBe('A skill')
    expect(button('Enregistrer mon profil').disabled).toBe(false)
  })
  it('does not misreport database failures as empty mission/contact lists', async () => {
    fixture.state.readErrors.add('missions_collectives')
    fixture.state.readErrors.add('entraide_contact_requests')
    await mount()
    await click('Résolutions Collectives')
    expect(container.textContent).toContain('Résolutions indisponibles')
    expect(container.textContent).not.toContain('Aucune résolution collective')
    await click('Contacts')
    expect(container.textContent).toContain('Demandes indisponibles')
    expect(container.textContent).not.toContain('Aucune demande')
  })
  it('shows the honest truncated-search notice', async () => {
    api.matches[A].scanned_profiles = 500
    api.matches[A].truncated = true
    await mount()
    expect(container.textContent).toContain('Recherche limitée à 500 profils')
    expect(container.textContent).toContain('D’autres correspondances peuvent exister')
  })
  it('unsubscribes and suppresses pending results when unmounted', async () => {
    const pending = deferred<Response>()
    api.override = call => call.route === 'matches' ? pending.promise : undefined
    await mount()
    await unmountAndReset()
    expect(fixture.state.listeners.size).toBe(0)
    pending.resolve(Response.json(api.matches[A]))
    await flush()
    expect(container.textContent).toBe('')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).not.toHaveBeenCalled()
  })
})

describe('silent SDK mismatch', () => {
  it('ends an initial stale-A spinner and exposes explicit reconciliation when SDK observes B', async () => {
    fixture.state.sdkSession = identity(B, 'token-B')
    await mount()
    expect(container.querySelector('[aria-label="Chargement Entraide"]')).toBeNull()
    expect(container.textContent).toContain('Votre session a changé')
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    await click('Actualiser la session')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(container.querySelector('#entraide-offered')).toBeNull()
    expect(api.calls).toHaveLength(0)
    expect(fixture.success).not.toHaveBeenCalled()
  })
  it('hides an already loaded A workspace and refuses its mutation under silent SDK B', async () => {
    await mount()
    await type('#entraide-offered', 'private A draft')
    fixture.state.sdkSession = identity(B, 'token-B')
    await click('Enregistrer mon profil')
    expect(container.textContent).toContain('Votre session a changé')
    expect(container.querySelector('#entraide-offered')).toBeNull()
    expect(container.textContent).not.toContain('Experts compatibles')
    expect(api.calls.filter(call => call.method === 'POST')).toHaveLength(0)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).not.toHaveBeenCalled()
  })
})

describe('auth subscription and pending mutation cleanup', () => {
  it('handles a synchronous initial B callback without an epoch loop under stale A props', async () => {
    fixture.state.sdkSession = identity(B, 'token-B')
    const original = fixture.client.auth.onAuthStateChange.bind(fixture.client.auth)
    const subscribe = vi.spyOn(fixture.client.auth, 'onAuthStateChange').mockImplementation(callback => {
      const result = original(callback)
      callback('INITIAL_SESSION', identity(B, 'token-B'))
      return result
    })
    await mount()
    await flush()
    expect(container.textContent).toContain('Votre session a changé')
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(api.calls).toHaveLength(0)
    await unmountAndReset()
    expect(fixture.state.listeners.size).toBe(0)
  })
  it('releases pending mutation controls on token refresh while preserving the draft', async () => {
    await mount()
    await type('#entraide-offered', 'draft across refresh')
    const pending = deferred<Response>()
    let sent!: ApiCall
    api.override = call => { if (call.method === 'POST') { sent = call; return pending.promise } }
    await click('Enregistrer mon profil')
    expect(button('Enregistrer mon profil').disabled).toBe(true)
    await switchSession(identity(A, 'token-A2'), 'TOKEN_REFRESHED')
    expect(button('Enregistrer mon profil').disabled).toBe(false)
    expect(input('#entraide-offered').value).toBe('draft across refresh')
    pending.resolve(responseFor(sent))
    await flush()
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).not.toHaveBeenCalled()
    expect(api.calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })
})
