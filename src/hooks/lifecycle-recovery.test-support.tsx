// @vitest-environment jsdom
import * as React from 'react'
import { act, createElement, StrictMode, useEffect, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createClient as createSupabaseClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import { afterEach, beforeEach, vi } from 'vitest'

export const A = '11111111-1111-4111-8111-111111111111'
export const B = '22222222-2222-4222-8222-222222222222'
const fixture = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authError: null as string | null,
  profile: null as Record<string, unknown> | null,
  client: null as SupabaseClient | null,
  refresh: vi.fn(async () => undefined),
  success: vi.fn(), error: vi.fn(), info: vi.fn(), qr: vi.fn(), push: vi.fn(),
}))
export { fixture }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: fixture.user, profile: fixture.profile, refetch: fixture.refresh, error: fixture.authError,
  session: fixture.user ? { user: fixture.user, access_token: 'synthetic-session' } : null,
}) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fixture.client }))
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error, info: fixture.info } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fixture.push }) }))
vi.mock('qrcode', () => ({ default: { toDataURL: fixture.qr } }))



export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
type Reply = ReturnType<typeof deferred<Response>>
export type Read = Reply & {
  url: URL; method: string; signal: AbortSignal | null | undefined; body: unknown; answered: boolean
}
export const reads: Read[] = []
export const liveChannels: Array<{
  name: string; filter: unknown; removed: boolean; raw: unknown; receive: (row: Record<string, unknown>) => void
}> = []
const mounts: Array<{ root: Root; container: HTMLDivElement }> = []

export function actor(id: string | null, overrides: Record<string, unknown> = {}) {
  fixture.user = id ? { id } : null
  fixture.profile = id ? {
    id, display_name: id === A ? 'Alice' : 'Bob', pseudo: '', bio: '',
    accent_color: '#00d4ff', level: 1, email: 'synthetic@example.invalid', ...overrides,
  } : null
}
export function pending(table: string, userId?: string) {
  const found = reads.find(read => !read.answered && read.url.pathname.endsWith('/' + table)
    && (!userId || [...read.url.searchParams.values()].includes('eq.' + userId)))
  if (!found) throw new Error('No controlled request for ' + table + ' / ' + (userId ?? '*'))
  return found
}
export async function respond(read: Read, data: unknown, status = 200, count?: number) {
  read.answered = true
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (count !== undefined) headers['Content-Range'] = '0-' + Math.max(0, count - 1) + '/' + count
  await act(async () => {
    read.resolve(new Response(read.method === 'HEAD' ? null : JSON.stringify(data), { status, headers }))
  })
}
export async function fail(read: Read) {
  await respond(read, { code: '42501', message: 'controlled denial' }, 403)
}
export async function mountHook<T>(readHook: () => T, strict = false) {
  let latest!: T
  function Harness() {
    const value = readHook()
    useEffect(() => { latest = value })
    return createElement('output', null, JSON.stringify(value))
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const record = { root, container }
  mounts.push(record)
  const render = () => strict
    ? createElement(StrictMode, null, createElement(Harness))
    : createElement(Harness)
  await act(async () => root.render(render()))
  return {
    get value() { return latest },
    container,
    rerender: async () => { await act(async () => root.render(render())) },
    unmount: async () => {
      await act(async () => root.unmount())
      mounts.splice(mounts.indexOf(record), 1)
      container.remove()
    },
  }
}
export async function mountComponent(Component: ComponentType) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const record = { root, container }
  mounts.push(record)
  await act(async () => root.render(createElement(Component)))
  return container
}
beforeEach(() => {
  vi.clearAllMocks()
  reads.length = 0
  liveChannels.length = 0
  fixture.refresh.mockReset().mockResolvedValue(undefined)
  fixture.qr.mockReset()
  actor(A)
  fixture.authError = null
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('React', React)
  const fetchControlled = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input), 'http://supabase.invalid')
    if (url.origin !== 'http://supabase.invalid') throw new Error('Unexpected network origin')
    const reply = deferred<Response>()
    reads.push({
      ...reply, url, method: init?.method ?? request?.method ?? 'GET',
      signal: init?.signal ?? request?.signal, answered: false,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    // Deliberately ignore abort in this controlled transport: stale completions must still be rejected.
    return reply.promise
  })
  vi.stubGlobal('fetch', fetchControlled)
  fixture.client = createSupabaseClient('http://supabase.invalid', 'synthetic-anon', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchControlled },
  })
  vi.spyOn(fixture.client, 'channel').mockImplementation(name => {
    const record: (typeof liveChannels)[number] = { name, filter: null, removed: false, raw: null, receive: () => undefined }
    const channel = {
      on(_kind: string, filter: unknown, callback: (payload: { new: Record<string, unknown> }) => void) {
        record.filter = filter
        record.receive = row => callback({ new: row })
        return channel
      },
      subscribe() { return channel },
    }
    record.raw = channel
    liveChannels.push(record)
    return channel as unknown as RealtimeChannel
  })
  vi.spyOn(fixture.client, 'removeChannel').mockImplementation(async channel => {
    const record = liveChannels.find(item => item.raw === channel)
    if (record) record.removed = true
    return 'ok' as const
  })
  fixture.qr.mockResolvedValue('data:synthetic-current')
})
afterEach(async () => {
  for (const record of mounts.splice(0)) {
    await act(async () => record.root.unmount())
    record.container.remove()
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
