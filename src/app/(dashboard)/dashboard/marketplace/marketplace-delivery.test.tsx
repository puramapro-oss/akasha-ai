// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = {
  table: string; mode: 'read' | 'update' | 'upsert'; filters: [string, unknown][]
  values?: Record<string, unknown>; columns?: string; order?: string; signal?: AbortSignal
}
const mocks = vi.hoisted(() => ({
  request: vi.fn(), success: vi.fn(), error: vi.fn(), push: vi.fn(),
  user: { id: 'owner-A' } as { id: string } | null, calls: [] as Call[],
}))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/lib/supabase', () => {
  const client = { from(table: string) {
    const call: Call = { table, mode: 'read', filters: [] }
    const chain = {
      select(columns: string) { call.columns = columns; return chain },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return chain },
      order(column: string) { call.order = column; return chain },
      abortSignal(signal: AbortSignal) { call.signal = signal; return chain },
      update(values: Record<string, unknown>) { call.mode = 'update'; call.values = values; return chain },
      upsert(values: Record<string, unknown>) { call.mode = 'upsert'; call.values = values; return chain },
      maybeSingle() { return chain }, single() { return chain },
      then(yes: (value: unknown) => unknown, no?: (error: unknown) => unknown) {
        const query = { ...call, filters: [...call.filters] }; mocks.calls.push(query)
        return Promise.resolve().then(() => mocks.request(query)).then(yes, no)
      },
    }
    return chain
  } }
  return { createClient: () => client }
})
import PublishModal from './PublishModal'
import MarketplacePage from './page'
import { MARKETPLACE_ACTION_TIMEOUT_MS } from './use-marketplace-action'

const own = (owner = 'owner-A') => ({
  id: 'own-' + owner, creator_id: owner, name: 'Private ' + owner,
  description: 'fixture', is_public: false, icon: null, color: null,
})
const publicAgent = {
  id: 'public-agent', creator_id: 'owner-A', name: 'Public agent', description: 'fixture',
  price: 0, rating: 4, installs_count: 7, is_verified: false, is_public: true,
  category: null, created_at: '2026-11-22T00:00:00Z',
}
function ordinary(call: Call) {
  if (call.mode === 'update') return {
    data: { id: call.filters.find(([key]) => key === 'id')?.[1],
      creator_id: call.filters.find(([key]) => key === 'creator_id')?.[1],
      is_public: call.values?.is_public }, error: null,
  }
  if (call.mode === 'upsert') return { data: call.values, error: null }
  const owner = call.filters.find(([key]) => key === 'creator_id')?.[1]
  // The canonical SQL schema stores agents.installs, not agents.installs_count.
  if (call.order && !['created_at', 'installs'].includes(call.order)) {
    return { data: null, error: { message: 'unknown canonical column' } }
  }
  return { data: owner ? [own(String(owner))] : [publicAgent], error: null }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let root: Root, container: HTMLDivElement, mounted = false
const close = vi.fn(), changed = vi.fn(), retry = vi.fn()
function props(extra: Partial<ComponentProps<typeof PublishModal>> = {}): ComponentProps<typeof PublishModal> {
  return { isOpen: true, onClose: close, ownAgents: [own()], loading: false,
    userId: 'owner-A', error: null, onRetry: retry, onToggleSuccess: changed, ...extra }
}
async function modal(extra: Partial<ComponentProps<typeof PublishModal>> = {}) {
  await act(async () => root.render(createElement(PublishModal, props(extra)))); mounted = true
}
async function page() { await act(async () => root.render(createElement(MarketplacePage))); mounted = true }
function button(id: string) {
  const node = container.querySelector<HTMLButtonElement>('[data-testid="' + id + '"]')
  if (!node) throw new Error('Missing button ' + id)
  return node
}
async function click(id: string, count = 1) {
  await act(async () => { for (let i = 0; i < count; i++) button(id).click() })
}
async function settle<T>(pending: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => { pending.resolve(value); await Promise.resolve() })
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.user = { id: 'owner-A' }; mocks.calls.length = 0; mocks.request.mockImplementation(ordinary)
  retry.mockResolvedValue(undefined)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  if (mounted) await act(async () => root.unmount())
  mounted = false; container.remove(); vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('marketplace publication confirmations and lifecycle', () => {
  it('confirms the owner, identity and requested visibility before changing the view', async () => {
    await modal(); await click('publish-toggle-own-owner-A')
    expect(mocks.success).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledWith('own-owner-A', false)
    expect(button('publish-toggle-own-owner-A').disabled).toBe(false)
  })
  it.each([
    ['missing receipt', null],
    ['wrong agent', { id: 'another', creator_id: 'owner-A', is_public: true }],
    ['wrong owner', { id: 'own-owner-A', creator_id: 'owner-B', is_public: true }],
    ['wrong visibility', { id: 'own-owner-A', creator_id: 'owner-A', is_public: false }],
  ])('rejects %s without a success or local publication', async (_label, data) => {
    mocks.request.mockResolvedValue({ data, error: null }); await modal(); await click('publish-toggle-own-owner-A')
    expect(mocks.success).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledOnce(); expect(button('publish-toggle-own-owner-A').disabled).toBe(false)
  })
  it('recovers from a rejected request and permits an explicit retry', async () => {
    mocks.request.mockRejectedValueOnce(new Error('private transport detail'))
    await modal(); await click('publish-toggle-own-owner-A')
    expect(button('publish-toggle-own-owner-A').disabled).toBe(false)
    expect(mocks.error).toHaveBeenCalledOnce(); expect(String(mocks.error.mock.calls)).not.toContain('private')
    await click('publish-toggle-own-owner-A'); expect(changed).toHaveBeenCalledOnce()
  })
  it('releases a stalled request and ignores its late receipt', async () => {
    const pending = deferred<unknown>(); mocks.request.mockReturnValue(pending.promise)
    await modal(); await click('publish-toggle-own-owner-A')
    await act(async () => { await vi.advanceTimersByTimeAsync(MARKETPLACE_ACTION_TIMEOUT_MS + 1) })
    expect(button('publish-toggle-own-owner-A').disabled).toBe(false); expect(mocks.error).toHaveBeenCalledOnce()
    expect(mocks.calls[0].signal?.aborted).toBe(true)
    await settle(pending, { data: { id: 'own-owner-A', creator_id: 'owner-A', is_public: true }, error: null })
    expect(changed).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
  })
  it('admits only one same-turn submission', async () => {
    const pending = deferred<unknown>(); mocks.request.mockReturnValue(pending.promise)
    await modal(); await click('publish-toggle-own-owner-A', 2)
    expect(mocks.calls).toHaveLength(1)
    await settle(pending, ordinary(mocks.calls[0])); expect(changed).toHaveBeenCalledOnce()
  })
  it.each(['close', 'account', 'unmount'])('revokes pending feedback after %s', async mode => {
    const pending = deferred<unknown>(); mocks.request.mockReturnValue(pending.promise)
    await modal(); await click('publish-toggle-own-owner-A'); const call = mocks.calls[0]
    if (mode === 'close') await modal({ isOpen: false })
    else if (mode === 'account') await modal({ userId: 'owner-B', ownAgents: [own('owner-B')] })
    else { await act(async () => root.unmount()); mounted = false }
    expect(call.signal?.aborted).toBe(true); await settle(pending, ordinary(call))
    expect(changed).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled()
  })
  it('does not admit a publication without an account', async () => {
    await modal({ userId: undefined }); expect(button('publish-toggle-own-owner-A').disabled).toBe(true)
    await click('publish-toggle-own-owner-A'); expect(mocks.calls).toHaveLength(0)
  })
  it('offers a retry for a private-list failure instead of reporting an empty collection', async () => {
    await modal({ error: new Error('fixture'), ownAgents: [] })
    expect(container.textContent).not.toContain('Aucun agent custom')
    await click('retry-own-agents'); expect(retry).toHaveBeenCalledOnce()
  })
})

describe('marketplace reads and installation receipts', () => {
  it('reads the canonical installation column and displays the returned count', async () => {
    await page(); expect(container.textContent).toContain('Public agent'); expect(container.textContent).toContain('7 installs')
    expect(mocks.calls.filter(call => call.filters.some(([key]) => key === 'creator_id'))).toHaveLength(0)
  })
  it('shows a public read failure and recovers through its retry control', async () => {
    mocks.request.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } })
    await page(); expect(container.textContent).toContain('Marketplace indisponible')
    expect(container.textContent).not.toContain('Aucun agent publie')
    await click('retry-marketplace'); expect(container.textContent).toContain('Public agent')
  })
  it('loads own agents on opening and never displays a former account after switching', async () => {
    const pending = deferred<unknown>()
    mocks.request.mockImplementation(call => call.filters.some(([key, id]: [string, unknown]) =>
      key === 'creator_id' && id === 'owner-A') ? pending.promise : ordinary(call))
    await page(); await click('open-publish-btn')
    mocks.user = { id: 'owner-B' }; await page()
    expect(container.textContent).toContain('Private owner-B'); expect(container.textContent).not.toContain('Private owner-A')
    await settle(pending, { data: [own('owner-A')], error: null })
    expect(container.textContent).toContain('Private owner-B'); expect(container.textContent).not.toContain('Private owner-A')
  })
  it('rejects an own-agent row belonging to another owner', async () => {
    mocks.request.mockImplementation(call => call.filters.some(([key]: [string, unknown]) => key === 'creator_id')
      ? { data: [own('owner-B')], error: null } : ordinary(call))
    await page(); await click('open-publish-btn')
    expect(container.textContent).toContain('Chargement indisponible')
    expect(container.textContent).not.toContain('Private owner-B')
  })
  it('confirms an installation then reloads counts without adding another local install', async () => {
    await page(); await click('install-agent-public-agent'); await click('install-agent-public-agent')
    expect(mocks.success).toHaveBeenCalledTimes(2); expect(container.textContent).toContain('7 installs')
    expect(container.textContent).not.toContain('9 installs')
  })
  it.each([
    ['missing receipt', null],
    ['another owner', { agent_id: 'public-agent', user_id: 'owner-B' }],
    ['another agent', { agent_id: 'other', user_id: 'owner-A' }],
  ])('rejects installation with %s', async (_label, data) => {
    mocks.request.mockImplementation(call => call.mode === 'upsert' ? { data, error: null } : ordinary(call))
    await page(); await click('install-agent-public-agent')
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalledOnce()
    expect(button('install-agent-public-agent').disabled).toBe(false)
  })
  it('releases an installation after a transport rejection', async () => {
    mocks.request.mockImplementation(call => call.mode === 'upsert' ? Promise.reject(new Error('fixture')) : ordinary(call))
    await page(); await click('install-agent-public-agent')
    expect(mocks.error).toHaveBeenCalledOnce(); expect(button('install-agent-public-agent').disabled).toBe(false)
  })
  it('ignores an installation receipt after switching accounts', async () => {
    const pending = deferred<unknown>()
    mocks.request.mockImplementation(call => call.mode === 'upsert' ? pending.promise : ordinary(call))
    await page(); await click('install-agent-public-agent')
    mocks.user = { id: 'owner-B' }; await page()
    await settle(pending, { data: { agent_id: 'public-agent', user_id: 'owner-A' }, error: null })
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled()
    expect(button('install-agent-public-agent').disabled).toBe(false)
  })
})
