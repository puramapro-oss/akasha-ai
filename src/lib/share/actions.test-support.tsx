// @vitest-environment jsdom
import { act, useCallback, useLayoutEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { Socket } from 'node:net'
import { useShareActions } from './useShareActions'
import type { ShareClient } from './tracking'

const doubles = vi.hoisted(() => ({ open: vi.fn(), info: vi.fn(), error: vi.fn() }))
vi.mock('./open-destination', () => ({ openShareDestination: doubles.open }))
vi.mock('sonner', () => ({ toast: { info: doubles.info, error: doubles.error } }))
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002'
const key = (actor = A) => 'akasha:pending-share:v1:' + actor
type RpcCall = { args: Record<string, string>; signal: AbortSignal;
  resolve: (result: unknown) => void; reject: (error: Error) => void }
let calls: RpcCall[], root: Root, host: HTMLDivElement
let actions: ReturnType<typeof useShareActions>
const reload = vi.fn(), copy = vi.fn()
const rpc = vi.fn()
const client = { rpc } as unknown as ShareClient

function Harness({ actor = A, today = 0 }: { actor?: string; today?: number }) {
  const live = useRef(false)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const isCurrent = useCallback(() => live.current, [])
  const currentActions = useShareActions({ client, userId: actor, shareCode: actor === A ? 'ref-a' : 'ref-b',
    shareLink: 'https://example.invalid/share/synthetic', shareText: 'Synthetic share', todayShares: today,
    isCurrent, reload, copy })
  useLayoutEffect(() => { actions = currentActions }, [currentActions])
  return <div>
    <button onClick={() => currentActions.share('whatsapp')} disabled={currentActions.disabled}>Platform</button>
    <button onClick={currentActions.nativeShare} disabled={currentActions.disabled}>Native</button>
    <button onClick={currentActions.retry} disabled={currentActions.busy}>Verify</button>
    <output>{currentActions.pending ? 'pending' : 'idle'}</output>
  </div>
}
async function mount(actor = A, today = 0) { await act(async () => root.render(<Harness key={actor} actor={actor} today={today} />)) }
async function click(action: () => unknown) { await act(async () => { action() }) }
async function confirm(index = 0, changes: Record<string, unknown> = {}) {
  const call = calls[index]
  await act(async () => call.resolve({ data: {
    replayed: false, today_shares: 1, share_id: '20000000-0000-4000-8000-000000000001',
    transaction_id: '30000000-0000-4000-8000-000000000001', request_id: call.args.p_request_id,
    user_id: A, share_code: call.args.p_share_code, platform_id: call.args.p_platform_hint,
    points: 400, shared_at: '2026-11-22T12:00:00Z', ...changes,
  }, error: null }))
}

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  sessionStorage.clear()
  localStorage.clear()
  doubles.open.mockReturnValue(true)
  reload.mockResolvedValue(undefined)
  copy.mockResolvedValue(undefined)
  rpc.mockImplementation((_name: string, args: Record<string, string>) => ({
    abortSignal: (signal: AbortSignal) => new Promise((resolve, reject) => calls.push({ args, signal, resolve, reject })),
  }))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No provider network admitted in share tests') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('No socket admitted') })
  const held = new Set<string>()
  const locks = { request: vi.fn(async <T,>(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<T>) => {
    expect(options.ifAvailable).toBe(true)
    if (held.has(name)) return callback(null)
    held.add(name)
    try { return await callback({ name, mode: 'exclusive' }) } finally { held.delete(name) }
  }) }
  vi.stubGlobal('navigator', { locks })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  expect(fetch).not.toHaveBeenCalled()
  expect(Socket.prototype.connect).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})


export { A, B, key, mount, click, confirm, calls, root, actions, reload, copy, rpc, doubles }
