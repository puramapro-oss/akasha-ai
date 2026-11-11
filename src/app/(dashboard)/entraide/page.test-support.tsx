// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

type ApiCall = { route: string; method: string; actor: string; init: RequestInit; body: Record<string, unknown> }
type Row = Record<string, unknown>
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const MISSION = '55555555-5555-4555-8555-555555555555'
const REQUEST = '44444444-4444-4444-8444-444444444444'

const fixture = vi.hoisted(() => {
  const state = {
    session: null as Session | null, sdkSession: null as Session | null,
    missions: [] as Row[], contacts: [] as Row[],
    listeners: new Set<(event: string, session: Session | null) => void>(),
    reads: [] as Array<{ table: string; columns: string; authorization: string }>,
    readErrors: new Set<string>(),
  }
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.sdkSession }, error: null })),
      onAuthStateChange(callback: (event: string, session: Session | null) => void) {
        state.listeners.add(callback)
        return { data: { subscription: { unsubscribe: () => state.listeners.delete(callback) } } }
      },
    },
    from(table: string) {
      const read = { table, columns: '', authorization: '' }
      state.reads.push(read)
      const query = {
        select(columns: string) { read.columns = columns; return query },
        order() { return query },
        or() { return query },
        setHeader(_name: string, value: string) { read.authorization = value; return query },
        abortSignal() { return query },
        then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
          const data = table === 'missions_collectives' ? state.missions : state.contacts
          return Promise.resolve(state.readErrors.has(table)
            ? { data: null, error: { message: 'private query error' } } : { data, error: null }).then(resolve)
        },
      }
      return query
    },
  }
  return { state, client, success: vi.fn(), error: vi.fn() }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: fixture.state.session, loading: false }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fixture.client }))
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }))
import EntraidePage from './page'

const user = (id: string) => ({ id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' })
const identity = (id = A, token = 'token-A'): Session => ({
  access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user: user(id),
})
const own = (id: string, skill = id === A ? 'A skill' : 'B skill') => ({
  user_id: id, skills_offered: [skill], skills_needed: ['code'], availability_days: ['mon'],
  radius_km: null, location_lat: null, location_lng: null,
})
const match = (id = B) => ({ userId: id, score: 75, reasons: ['skills'] })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
let root: Root
let container: HTMLDivElement
export const api = {
  calls: [] as ApiCall[],
  profiles: {} as Record<string, ReturnType<typeof own> | null>,
  matches: {} as Record<string, { matches: ReturnType<typeof match>[]; scanned_profiles: number; truncated: boolean }>,
  override: undefined as ((call: ApiCall) => Promise<Response> | Response | undefined) | undefined,
}

function responseFor(call: ApiCall): Response {
  if (call.method === 'GET') {
    return Response.json(call.route === 'profile' ? { profile: api.profiles[call.actor] ?? null } : api.matches[call.actor])
  }
  if (call.route === 'profile') return Response.json({ profile: { ...own(call.actor), ...call.body } })
  if (call.route === 'missions') {
    if ('title' in call.body) return Response.json({ mission_id: MISSION })
    return Response.json({ mission: {
      id: MISSION, minParticipants: 2, maxParticipants: null, participantIds: [A, B], status: 'prete',
    } })
  }
  return Response.json('recipient_id' in call.body
    ? { request_id: REQUEST }
    : { status: call.body.response === 'accept' ? 'accepted' : call.body.response === 'block' ? 'blocked' : 'declined' })
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture.state.listeners.clear()
  fixture.state.reads.length = 0
  fixture.state.readErrors.clear()
  fixture.state.missions = []
  fixture.state.contacts = []
  fixture.state.session = identity()
  fixture.state.sdkSession = fixture.state.session
  fixture.client.auth.getSession.mockImplementation(async () => ({ data: { session: fixture.state.sdkSession }, error: null }))
  api.profiles = { [A]: own(A), [B]: own(B) }
  api.matches = {
    [A]: { matches: [match()], scanned_profiles: 1, truncated: false },
    [B]: { matches: [match(C)], scanned_profiles: 1, truncated: false },
  }
  api.calls = []
  api.override = undefined
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const token = new Headers(init.headers).get('authorization') ?? ''
    const call: ApiCall = {
      route: url.split('/').at(-1)!, method: init.method ?? 'GET',
      actor: token.includes('token-B') ? B : A, init,
      body: init.body ? JSON.parse(String(init.body)) : {},
    }
    api.calls.push(call)
    return Promise.resolve(api.override?.(call) ?? responseFor(call))
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function flush() {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
    else await new Promise(resolve => setTimeout(resolve, 0))
  })
}
async function mount() { await act(async () => root.render(createElement(EntraidePage))); await flush() }
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === label)
  if (!result) throw new Error('Missing button: ' + label + '; text: ' + container.textContent)
  return result
}
async function click(label: string) { await act(async () => button(label).click()); await flush() }
function input(selector: string) {
  const result = container.querySelector<HTMLInputElement>(selector)
  if (!result) throw new Error('Missing input: ' + selector)
  return result
}
async function type(selector: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(selector), value)
    input(selector).dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function switchSession(value: Session, event = 'SIGNED_IN') {
  await act(async () => {
    fixture.state.sdkSession = value
    fixture.state.session = value
    for (const listener of [...fixture.state.listeners]) listener(event, value)
    root.render(createElement(EntraidePage))
  })
  await flush()
}

type Action = { name: string; button: string; tab?: string; route: string; body: Record<string, unknown> }
const actions: Action[] = [
  { name: 'saveProfile', button: 'Enregistrer mon profil', route: 'profile',
    body: { skills_offered: ['edited'], skills_needed: ['code'], availability_days: ['mon'] } },
  { name: 'createMission', button: 'Créer', tab: 'Résolutions Collectives', route: 'missions',
    body: { title: 'New mission', description: '', min_participants: 2, max_participants: null } },
  ...(['join', 'leave', 'start', 'complete', 'cancel'] as const).map((action, index) => ({
    name: action + 'Mission', button: ['Rejoindre', 'Quitter', 'Démarrer', 'Terminer', 'Annuler'][index],
    tab: 'Résolutions Collectives', route: 'missions', body: { mission_id: MISSION, action },
  })),
  { name: 'sendContactRequest', button: 'Contacter', route: 'contacts', body: { recipient_id: B, message: null } },
  ...(['accept', 'decline', 'block'] as const).map((response, index) => ({
    name: 'respondToContact:' + response, button: ['Accepter', 'Refuser', 'Bloquer'][index],
    tab: 'Contacts', route: 'contacts', body: { request_id: REQUEST, response },
  })),
]
async function prepareAction(action: Action) {
  if (action.body.action) {
    const kind = action.body.action
    fixture.state.missions = [{
      id: MISSION, title: 'Test resolution', description: '', created_at: '2026-01-01',
      organizer_id: kind === 'join' || kind === 'leave' ? B : A,
      status: kind === 'start' ? 'prete' : kind === 'complete' ? 'en_cours' : 'ouverte',
      min_participants: 2, max_participants: null,
      missions_collectives_participants: kind === 'join' ? [{ user_id: B }] : [{ user_id: A }, { user_id: B }],
    }]
  }
  if (action.body.response) fixture.state.contacts = [{
    id: REQUEST, requester_id: B, recipient_id: A, status: 'pending', message: 'Hello', created_at: '2026-01-01',
  }]
  await mount()
  if (action.tab) await click(action.tab)
  if (action.name === 'saveProfile') await type('#entraide-offered', 'edited')
  if (action.name === 'createMission') await type('input[placeholder="Titre de la résolution"]', 'New mission')
}

async function unmountAndReset() {
  await act(async () => root.unmount())
  root = createRoot(container)
}

export {
  fixture, root, container, A, B, C, MISSION, REQUEST, user, identity, own, match,
  deferred, responseFor, mount, flush, button, input, type, click, switchSession,
  actions, prepareAction, unmountAndReset,
}
export type { ApiCall }
