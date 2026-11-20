// @vitest-environment jsdom
import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  fixture, root, container, A, B, C, user, identity, own, match,
  deferred, responseFor, mount, flush, button, input, type, click, switchSession,
  actions, prepareAction, api, type ApiCall,
} from './page.test-support'
import EntraidePage from './page'

describe('Entraide page preserves all nine mutation handlers', () => {
  it.each(actions)('$name sends its original intent with the captured actor', async action => {
    await prepareAction(action)
    await click(action.button)
    const posts = api.calls.filter(call => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ route: action.route, body: action.body })
    expect(new Headers(posts[0].init.headers).get('authorization')).toBe('Bearer token-A')
    expect(posts[0].init.credentials).toBe('omit')
    expect(fixture.success).toHaveBeenCalledTimes(1)
    expect(fixture.error).not.toHaveBeenCalled()
    expect(fixture.state.reads.every(read => read.authorization === 'Bearer token-A' && !read.columns.includes('*'))).toBe(true)
    expect(fixture.state.reads.some(read => read.table === 'entraide_profils')).toBe(false)
  })
  it.each(actions)('$name cannot publish its pending A result into B', async action => {
    await prepareAction(action)
    const pending = deferred<Response>()
    let sent: ApiCall | undefined
    api.override = call => {
      if (call.method === 'POST') { sent = call; return pending.promise }
    }
    await click(action.button)
    expect(sent).toBeDefined()
    expect(new Headers(sent!.init.headers).get('authorization')).toBe('Bearer token-A')
    fixture.state.missions = []
    fixture.state.contacts = []
    await switchSession(identity(B, 'token-B'))
    await type('#entraide-offered', 'B draft')
    const requestCount = api.calls.length
    pending.resolve(responseFor(sent!))
    await flush()
    expect(input('#entraide-offered').value).toBe('B draft')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).not.toHaveBeenCalled()
    expect(api.calls).toHaveLength(requestCount)
    expect((sent!.init.signal as AbortSignal).aborted).toBe(true)
  })
})

describe('bounded UI waits and minimal auth dependencies', () => {
  it('does not reload for a new session object with identical actor and token', async () => {
    await mount()
    await type('#entraide-offered', 'same session draft')
    const calls = api.calls.length
    const reads = fixture.state.reads.length
    const listenerCount = fixture.state.listeners.size
    await switchSession({ ...identity(), user: { ...user(A) } })
    expect(api.calls).toHaveLength(calls)
    expect(fixture.state.reads).toHaveLength(reads)
    expect(fixture.state.listeners.size).toBe(listenerCount)
    expect(input('#entraide-offered').value).toBe('same session draft')
  })
  it('starts a fresh epoch after batched A -> B -> A notifications with unchanged final primitives', async () => {
    const old = deferred<Response>()
    let held = false
    api.override = call => {
      if (!held && call.route === 'matches') { held = true; return old.promise }
    }
    await mount()
    api.profiles[A] = own(A, 'fresh batched A')
    await act(async () => {
      const intermediate = identity(B, 'token-B')
      fixture.state.sdkSession = intermediate
      for (const listener of [...fixture.state.listeners]) listener('SIGNED_IN', intermediate)
      fixture.state.sdkSession = identity()
      fixture.state.session = fixture.state.sdkSession
      for (const listener of [...fixture.state.listeners]) listener('SIGNED_IN', fixture.state.session)
      root.render(createElement(EntraidePage))
    })
    await flush()
    expect(input('#entraide-offered').value).toBe('fresh batched A')
    old.resolve(Response.json({ matches: [match(C)], scanned_profiles: 1, truncated: false }))
    await flush()
    expect(container.textContent).not.toContain('Expert ' + C.slice(0, 8))
    expect(container.textContent).toContain('Expert ' + B.slice(0, 8))
  })
  it.each(['auth', 'fetch', 'json'])('ends the loading spinner and shows an error when %s stalls', async stage => {
    vi.useFakeTimers()
    if (stage === 'auth') fixture.client.auth.getSession.mockImplementation(() => new Promise(() => {}))
    if (stage === 'fetch') api.override = call => call.method === 'GET' ? new Promise(() => {}) : undefined
    if (stage === 'json') api.override = call => {
      if (call.route !== 'profile') return undefined
      const response = Response.json({ profile: own(A) })
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}))
      return response
    }
    await mount()
    expect(container.querySelector('[aria-label="Chargement Entraide"]')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(20_001) })
    await flush()
    expect(container.querySelector('[aria-label="Chargement Entraide"]')).toBeNull()
    expect(container.textContent).toContain('Délai dépassé')
    expect(container.textContent).toContain('Actualisez les données')
    expect(button('Enregistrer mon profil').disabled).toBe(true)
    expect(fixture.success).not.toHaveBeenCalled()
  })
  it('ends mutation busy state without replaying or claiming that an expired write did not happen', async () => {
    await mount()
    await type('#entraide-offered', 'uncertain saved draft')
    vi.useFakeTimers()
    const pending = deferred<Response>()
    let sent!: ApiCall
    api.override = call => { if (call.method === 'POST') { sent = call; return pending.promise } }
    await click('Enregistrer mon profil')
    expect(button('Enregistrer mon profil').disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_001) })
    await flush()
    expect(button('Enregistrer mon profil').disabled).toBe(false)
    expect(input('#entraide-offered').value).toBe('uncertain saved draft')
    expect(container.textContent).toContain('vérifier l’état de l’opération')
    expect(fixture.error).toHaveBeenCalledWith(expect.stringContaining('Actualisez'))
    expect((sent.init.signal as AbortSignal).aborted).toBe(true)
    expect(api.calls.filter(call => call.method === 'POST')).toHaveLength(1)
    const count = api.calls.length
    pending.resolve(responseFor(sent))
    await flush()
    expect(fixture.success).not.toHaveBeenCalled()
    expect(api.calls).toHaveLength(count)
  })
})
