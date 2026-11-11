import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient, type Session } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase'
import {
  createEntraideSession, EntraideSessionChanged, type EntraideSession,
} from '@/lib/entraide-client'
import { MatchesResponseSchema, OwnProfileResponseSchema } from '@/lib/entraide-contracts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
type BrowserClient = ReturnType<typeof createClient>
const user = (id: string) => ({
  id, aud: 'authenticated', app_metadata: {}, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
})
const session = (id = A, token = 'token-A'): Session => ({
  access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(id),
})
const profile = { user_id: A, skills_offered: [], skills_needed: [], availability_days: [],
  radius_km: null, location_lat: null, location_lng: null }
const noMatches = { matches: [], scanned_profiles: 0, truncated: false }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
function authView(initial = session()) {
  let current: Session | null = initial
  const listeners = new Set<(event: string, value: Session | null) => void>()
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((listener: (event: string, value: Session | null) => void) => {
      listeners.add(listener)
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    }),
  }
  return {
    auth,
    set(value: Session | null, event = 'SIGNED_IN') {
      current = value
      for (const listener of [...listeners]) listener(event, value)
    },
    silentSet(value: Session | null) { current = value },
    get listenerCount() { return listeners.size },
  }
}
function testClient(view = authView()) {
  const calls: Array<{ table: string; columns?: string; headers: Record<string, string>; signal?: AbortSignal }> = []
  const rows = { data: [] as unknown, error: null as unknown }
  const client = {
    auth: view.auth,
    from(table: string) {
      const record = { table, headers: {} } as (typeof calls)[number]
      calls.push(record)
      const query = {
        select(columns: string) { record.columns = columns; return query },
        order() { return query },
        or() { return query },
        setHeader(name: string, value: string) { record.headers[name] = value; return query },
        abortSignal(signal: AbortSignal) { record.signal = signal; return query },
        then(resolve: (value: typeof rows) => unknown) { return Promise.resolve(rows).then(resolve) },
      }
      return query
    },
  }
  return { client: client as unknown as BrowserClient, view, calls, rows }
}
let scopes: EntraideSession[] = []
function scope(client: BrowserClient, identity = session()) {
  const value = createEntraideSession(client, identity)
  scopes.push(value)
  return value
}
beforeEach(() => { scopes = [] })
afterEach(() => {
  scopes.forEach(value => value.dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('captured-session HTTP transport', () => {
  it('sends the captured bearer and signal without ambient cookies or HTTP caching', async () => {
    const mock = testClient()
    const fetcher = vi.fn(async () => Response.json({ profile }))
    vi.stubGlobal('fetch', fetcher)
    const operation = scope(mock.client).start()
    await operation.request('profile', OwnProfileResponseSchema, { skills_offered: ['design'] })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/entraide/profile', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer token-A', 'Content-Type': 'application/json' },
      credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal),
      body: JSON.stringify({ skills_offered: ['design'] }),
    }))
  })
  it('refuses a changed SDK session before dispatch even without an auth event', async () => {
    const mock = testClient()
    const boundary = scope(mock.client)
    mock.view.silentSet(session(B, 'token-B'))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(boundary.start().request('profile', OwnProfileResponseSchema)).rejects.toBeInstanceOf(EntraideSessionChanged)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('cancels a late A response after switching to B', async () => {
    const mock = testClient()
    const pending = deferred<Response>()
    const fetcher = vi.fn(() => pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const boundary = scope(mock.client)
    const operation = boundary.start()
    const result = operation.request('profile', OwnProfileResponseSchema)
    const rejected = expect(result).rejects.toBeInstanceOf(EntraideSessionChanged)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    mock.view.set(session(B, 'token-B'))
    pending.resolve(Response.json({ profile }))
    await rejected
    expect(operation.active()).toBe(false)
    boundary.dispose()
    expect(mock.view.listenerCount).toBe(0)
  })
  it('does not revive an old A request after A -> B -> A with the same token', async () => {
    const mock = testClient()
    const pending = deferred<Response>()
    const fetcher = vi.fn().mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(Response.json(noMatches))
    vi.stubGlobal('fetch', fetcher)
    const old = scope(mock.client).start()
    const rejected = expect(old.request('matches', MatchesResponseSchema)).rejects.toBeInstanceOf(EntraideSessionChanged)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    mock.view.set(session(B, 'token-B'))
    mock.view.set(session())
    const fresh = scope(mock.client).start()
    expect(await fresh.request('matches', MatchesResponseSchema)).toEqual(noMatches)
    pending.resolve(Response.json({ matches: [{ userId: B, score: 90, reasons: [] }], scanned_profiles: 1, truncated: false }))
    await rejected
  })
  it('invalidates a request on token refresh while allowing the new epoch', async () => {
    const mock = testClient()
    const pending = deferred<Response>()
    const fetcher = vi.fn().mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(Response.json(noMatches))
    vi.stubGlobal('fetch', fetcher)
    const old = scope(mock.client).start()
    const rejected = expect(old.request('matches', MatchesResponseSchema)).rejects.toBeInstanceOf(EntraideSessionChanged)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const refreshed = session(A, 'token-A2')
    mock.view.set(refreshed, 'TOKEN_REFRESHED')
    expect(await scope(mock.client, refreshed).start().request('matches', MatchesResponseSchema)).toEqual(noMatches)
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer token-A2')
    pending.resolve(Response.json(noMatches))
    await rejected
  })
  it('ignores a response after explicit cancellation even if fetch does not reject on abort', async () => {
    const mock = testClient()
    const pending = deferred<Response>()
    const fetcher = vi.fn(() => pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const operation = scope(mock.client).start()
    const rejected = expect(operation.request('matches', MatchesResponseSchema)).rejects.toBeInstanceOf(EntraideSessionChanged)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    operation.cancel()
    pending.resolve(Response.json(noMatches))
    await rejected
  })
  it('rejects private fields in a matching response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      matches: [{ userId: B, score: 10, reasons: [], location_lat: 48.8 }], scanned_profiles: 1, truncated: false,
    })))
    await expect(scope(testClient().client).start().request('matches', MatchesResponseSchema))
      .rejects.toThrow('Réponse Entraide invalide.')
  })
  it('does not display raw provider errors or invalid JSON as successful data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: 'private provider payload' }, { status: 503 }))
      .mockResolvedValueOnce(new Response('invalid-json'))
    vi.stubGlobal('fetch', fetcher)
    const boundary = scope(testClient().client)
    await expect(boundary.start().request('matches', MatchesResponseSchema)).rejects.toThrow('Service Entraide indisponible')
    await expect(boundary.start().request('matches', MatchesResponseSchema)).rejects.toThrow('Réponse Entraide invalide')
  })
  it('refuses a foreign contact row even if the database adapter returns one', async () => {
    const mock = testClient()
    mock.rows.data = [{
      id: '44444444-4444-4444-8444-444444444444', requester_id: B, recipient_id: C,
      status: 'pending', message: null, created_at: '2026-01-01',
    }]
    await expect(scope(mock.client).start().contacts()).rejects.toThrow('Réponse Entraide invalide')
  })
  it.each(['missions', 'contacts'] as const)('does not turn %s database errors into an empty list', async method => {
    const mock = testClient()
    mock.rows.error = { message: 'private database detail' }
    await expect(scope(mock.client).start()[method]()).rejects.toThrow('indisponibles')
    expect(mock.calls[0].headers.Authorization).toBe('Bearer token-A')
    expect(mock.calls[0].columns).not.toContain('*')
  })
})

describe('real Supabase SDK identity and PostgREST transport', () => {
  it('getUser(A) leaves SDK session B unchanged; real queries explicitly send captured A', async () => {
    const jwt = (id: string) => [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'synthetic-signature',
    ].join('.')
    const tokenA = jwt(A)
    const tokenB = jwt(B)
    const sessionB = session(B, tokenB)
    const storage = new Map([['entraide-controlled', JSON.stringify(sessionB)]])
    const emitted: Array<{ url: string; authorization: string | null }> = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      const headers = new Headers(init?.headers)
      const authorization = headers.get('authorization')
      emitted.push({ url, authorization })
      if (url.includes('/auth/v1/user')) return Response.json(user(authorization === 'Bearer ' + tokenA ? A : B))
      return Response.json([])
    }
    const real = createSupabaseClient('https://supabase.invalid', 'synthetic-anon', {
      db: { schema: 'akasha_ai' },
      auth: { storageKey: 'entraide-controlled', persistSession: true, autoRefreshToken: false,
        detectSessionInUrl: false, storage: {
          getItem: key => storage.get(key) ?? null,
          setItem: (key, value) => { storage.set(key, value) },
          removeItem: key => { storage.delete(key) },
        } },
      global: { fetch: fetcher },
    })
    expect((await real.auth.getSession()).data.session?.user.id).toBe(B)
    expect((await real.auth.getUser(tokenA)).data.user?.id).toBe(A)
    expect((await real.auth.getSession()).data.session?.user.id).toBe(B)
    await real.from('missions_collectives').select('id')
    expect(emitted.at(-1)?.authorization).toBe('Bearer ' + tokenB)

    // Adversarial timing: the view still owns A, while the real database client has B.
    // Only auth observation is controlled; from/select/setHeader/abortSignal/fetch are real SDK.
    const view = authView(session(A, tokenA))
    const observed = { auth: view.auth, from: real.from.bind(real) } as unknown as BrowserClient
    const operation = scope(observed, session(A, tokenA)).start()
    expect(await operation.missions()).toEqual([])
    expect(await operation.contacts()).toEqual({ received: [], sent: [] })
    expect(emitted.slice(-2).map(call => call.authorization)).toEqual(['Bearer ' + tokenA, 'Bearer ' + tokenA])
    expect(emitted.at(-1)?.url).toContain(encodeURIComponent(A))
    expect((await real.auth.getSession()).data.session?.user.id).toBe(B)
    real.auth.stopAutoRefresh()
  })
})

describe('bounded request deadline', () => {
  it.each(['auth', 'fetch', 'json'])('bounds a stalled %s stage and stops the request', async stage => {
    vi.useFakeTimers()
    const mock = testClient()
    if (stage === 'auth') mock.view.auth.getSession.mockImplementation(() => new Promise(() => {}))
    const response = Response.json(noMatches)
    if (stage === 'json') vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}))
    const fetcher = vi.fn<typeof fetch>(() => stage === 'fetch' ? new Promise(() => {}) : Promise.resolve(response))
    vi.stubGlobal('fetch', fetcher)
    const outcome = { settled: false, error: null as unknown }
    void scope(mock.client).start().request('matches', MatchesResponseSchema).then(
      () => { outcome.settled = true },
      error => { outcome.settled = true; outcome.error = error },
    )
    await vi.advanceTimersByTimeAsync(20_001)
    expect(outcome.settled).toBe(true)
    expect(outcome.error).toBeInstanceOf(Error)
    expect((outcome.error as Error).message).toContain('Actualisez')
    if (stage === 'auth') expect(fetcher).not.toHaveBeenCalled()
    else expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})

describe('real PostgREST cancellation', () => {
  it('aborts the actual SDK fetch at the deadline and performs no later retry', async () => {
    vi.useFakeTimers()
    let aborts = 0
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) throw new Error('SDK omitted the abort signal')
      const abort = () => { aborts += 1; reject(new DOMException('Aborted', 'AbortError')) }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }))
    const real = createSupabaseClient('https://supabase.invalid', 'synthetic-anon', {
      db: { schema: 'akasha_ai' }, accessToken: async () => 'ambient-token-B',
      global: { fetch: fetcher },
    })
    const view = authView()
    const observed = { auth: view.auth, from: real.from.bind(real) } as unknown as BrowserClient
    const operation = scope(observed).start()
    const rejected = expect(operation.missions()).rejects.toThrow('Actualisez')
    await vi.advanceTimersByTimeAsync(20_001)
    await rejected
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token-A')
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(aborts).toBe(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    operation.finish()
  })
})
