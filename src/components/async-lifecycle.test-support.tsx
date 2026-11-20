import React, { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const fixture = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  awakening: {} as Record<string, unknown>,
  client: null as unknown,
  transport: vi.fn<(request: Request) => Promise<Response>>(),
  initialize: vi.fn(),
  logout: vi.fn(async () => undefined),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  seen: vi.fn(),
  affirmation: vi.fn(() => ({ text: 'Une affirmation', category: 'confiance' })),
  requests: [] as Request[],
  unexpected: [] as string[],
}))
export { fixture }
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error, info: fixture.info } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => fixture.auth }))
vi.mock('@/hooks/useAwakening', () => ({ useAwakening: () => fixture.awakening }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fixture.client }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: fixture.replace }) }))
vi.mock('@stripe/connect-js', () => ({ loadConnectAndInitialize: fixture.initialize }))
vi.mock('@stripe/react-connect-js', () => ({
  ConnectComponentsProvider: ({ children }: { children: ReactNode }) => <div data-testid="connect-provider">{children}</div>,
  ConnectAccountOnboarding: () => <div />,
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div> },
}))
vi.mock('@/app/onboarding/OnboardingSteps', () => ({
  default: ({ pseudo, setPseudo, onFinish }: { pseudo: string; setPseudo: (value: string) => void; onFinish: () => Promise<void> }) =>
    <><input data-testid="onboarding-pseudo" value={pseudo} onChange={event => setPseudo(event.target.value)} />
      <button data-testid="finish-onboarding" onClick={() => void onFinish()}>Terminer</button></>,
}))

const roots: Array<{ root: Root; container: HTMLDivElement }> = []
function createControlledClient(fetcher: typeof fetch) {
  return createClient('https://supabase.invalid', 'synthetic-anon', {
    db: { schema: 'akasha_ai' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  })
}
let client: ReturnType<typeof createControlledClient>
export function profile(id = A, name = 'Alice') {
  return { id, display_name: name, pseudo: 'alice', bio: 'Présentation', level: 1, xp: 0,
    streak_count: 0, created_at: '2026-01-01T00:00:00Z', onboarding_completed: false, plan: 'free', role: 'user' }
}
export function actor(id = A, name = 'Alice') {
  fixture.auth = { user: { id }, profile: profile(id, name), session: { access_token: 'synthetic-' + id, user: { id } },
    loading: false, isAuthenticated: true, isSuperAdmin: false, refetch: vi.fn(async () => undefined) }
}
export async function seedClientSession() {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
  const access_token = encode({ alg: 'none' }) + '.' + encode({ sub: A, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.' + encode('synthetic-signature')
  const { error } = await client.auth.setSession({ access_token, refresh_token: 'synthetic-refresh' })
  if (error) throw error
}
export function syntheticUser() {
  return { id: A, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid',
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
}
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}
export async function mount(node: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push({ root, container })
  await act(async () => { root.render(node) })
  return {
    container,
    async render(next: ReactNode) { await act(async () => { root.render(next) }) },
    async unmount() { await act(async () => { root.unmount() }); roots.splice(roots.findIndex(x => x.root === root), 1); container.remove() },
  }
}
export async function input(element: Element | null, value: string) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('Input missing')
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
export async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error('Button missing')
  await act(async () => { element.click() })
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  fixture.requests.length = 0; fixture.unexpected.length = 0
  actor()
  fixture.awakening = { affirmationSeen: false, markAffirmationSeen: fixture.seen,
    getAffirmation: fixture.affirmation, levelInfo: { emoji: '★', name: 'Explorateur' } }
  fixture.logout.mockReset().mockResolvedValue(undefined)
  fixture.initialize.mockReset().mockReturnValue({ logout: fixture.logout })
  fixture.transport.mockReset().mockImplementation(async request => {
    if (new URL(request.url).pathname === '/rest/v1/user_badges') {
      return Response.json([], { headers: { 'Content-Range': '*/0' } })
    }
    fixture.unexpected.push(request.method + ' ' + request.url)
    throw new Error('Unexpected synthetic request')
  })
  const strictFetch: typeof fetch = async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(String(input), 'http://localhost').href, init)
    if (!['https://supabase.invalid', 'http://localhost'].includes(new URL(request.url).origin)) {
      fixture.unexpected.push(request.url); throw new Error('External request forbidden')
    }
    fixture.requests.push(request)
    return fixture.transport(request)
  }
  client = createControlledClient(strictFetch)
  fixture.client = client
  vi.stubGlobal('fetch', strictFetch)
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_synthetic_fixture')
})
afterEach(async () => {
  while (roots.length) {
    const view = roots.pop()!
    await act(async () => { view.root.unmount() }); view.container.remove()
  }
  client.auth.stopAutoRefresh()
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  expect(fixture.unexpected).toEqual([])
})
