// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWithdraw } from '../../src/components/connect/use-withdraw'
import WithdrawButton from '../../src/components/connect/WithdrawButton'

const mocks = vi.hoisted(() => ({ userId: '00000000-0000-4000-8000-000000000001' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: { id: mocks.userId }, loading: false,
}) }))
const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const KEY = '10000000-0000-4000-8000-000000000001'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'
const keyFor = (ownerId = USER) => 'akasha:withdrawal-intent:v1:' + ownerId
type Body = { owner_id: string; idempotency_key: string; amount_eur?: number; action?: 'cancel' }
const bodyOf = (init?: RequestInit): Body => JSON.parse(String(init?.body)) as Body
const successful = (body: Body, overrides: Record<string, unknown> = {}) =>
  Response.json({ ok: true, request_id: REQUEST_ID, request_key: body.idempotency_key,
    operation_state: 'completed', transfer_id: 'tr_synthetic', amount_eur: body.amount_eur ?? 20,
    new_balance_eur: 80, ...overrides })
const savedIntent = (ownerId = USER) => ({ version: 1, ownerId, requestKey: KEY, amount: 20, requestedAmount: 20 })

describe('Real withdrawal React hook, persistent per-owner intention; no HTTP/provider', () => {
  let root: Root
  let element: HTMLDivElement
  let latest: ReturnType<typeof useWithdraw>
  let balance = 100
  const onSuccess = vi.fn()
  function Harness() {
    latest = useWithdraw({ balanceEur: balance, onSuccess })
    return React.createElement('button', { onClick: () => void latest.submit() }, 'withdraw')
  }
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    localStorage.clear(); mocks.userId = USER; balance = 100; onSuccess.mockReset()
    element = document.createElement('div'); document.body.appendChild(element)
    root = createRoot(element)
  })
  afterEach(async () => {
    await act(async () => { root.unmount() })
    element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  })
  async function mount() {
    await act(async () => { root.render(React.createElement(Harness)) })
    await act(async () => { latest.resetState(); latest.setAmount('20') })
  }
  const submit = () => act(async () => { await latest.submit() })

  it('prevents same-tick double submission before React re-renders', async () => {
    let resolve!: (response: Response) => void
    const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>(yes => { resolve = yes }))
    vi.stubGlobal('fetch', fetcher); await mount()
    let pending!: Promise<void>
    await act(async () => { pending = latest.submit(); void latest.submit() })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(successful(bodyOf(fetcher.mock.calls[0][1]))); await pending })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
  it('retains the exact request after a network failure and reuses its key', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => successful(bodyOf(init)))
    fetcher.mockRejectedValueOnce(new Error('response lost'))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    const firstKey = bodyOf(fetcher.mock.calls[0][1]).idempotency_key
    expect(latest.pending).toBe(true); expect(localStorage.getItem(keyFor())).toContain(firstKey)
    await submit()
    expect(bodyOf(fetcher.mock.calls[1][1]).idempotency_key).toBe(firstKey)
    expect(localStorage.getItem(keyFor())).toBeNull(); expect(latest.success?.ok).toBe(true)
  })
  it('reload/remount restores the pending key even when the displayed balance is zero', async () => {
    localStorage.setItem(keyFor(), JSON.stringify(savedIntent()))
    balance = 0
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => successful(bodyOf(init), { replayed: true, new_balance_eur: 0 }))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    expect(bodyOf(fetcher.mock.calls[0][1]).idempotency_key).toBe(KEY)
    expect(latest.success?.ok).toBe(true); expect(onSuccess).not.toHaveBeenCalled()
  })
  it('late response after account switch updates neither the new owner nor their storage', async () => {
    let resolve!: (response: Response) => void
    const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>(yes => { resolve = yes }))
    vi.stubGlobal('fetch', fetcher); await mount()
    let pending!: Promise<void>
    await act(async () => { pending = latest.submit() })
    const first = bodyOf(fetcher.mock.calls[0][1])
    await act(async () => { mocks.userId = OTHER; root.render(React.createElement(Harness)) })
    await act(async () => { resolve(successful(first)); await pending })
    expect(onSuccess).not.toHaveBeenCalled(); expect(latest.success).toBeNull()
    expect(localStorage.getItem(keyFor(USER))).toContain(first.idempotency_key)
    expect(localStorage.getItem(keyFor(OTHER))).toBeNull()
  })
  it('refuses submission when durable intention storage is unavailable', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); await mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
    await submit(); expect(fetcher).not.toHaveBeenCalled()
    expect(latest.error).toBeTruthy()
  })
  it('does not overwrite a malformed preexisting intention', async () => {
    localStorage.setItem(keyFor(), '{broken')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    expect(fetcher).not.toHaveBeenCalled(); expect(localStorage.getItem(keyFor())).toBe('{broken')
  })
  it.each([
    { request_key: KEY }, { new_balance_eur: -1 }, { request_id: 'invalid' }, { transfer_id: null },
  ])('does not trust a mismatched or malformed success %j', async overrides => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => successful(bodyOf(init), overrides))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    expect(latest.success).toBeNull(); expect(latest.pending).toBe(true)
    expect(onSuccess).not.toHaveBeenCalled(); expect(localStorage.getItem(keyFor())).not.toBeNull()
  })
  it('a preflight error does not discard an intention which another request could admit', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => Response.json({
      ok: false, request_key: bodyOf(init).idempotency_key, code: 'insufficient_balance',
      error: 'Solde insuffisant', retry_same_request: true,
    }, { status: 400 }))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    expect(latest.pending).toBe(true); expect(localStorage.getItem(keyFor())).not.toBeNull()
  })
  it('adopts the active server intention and preserves omitted amount on replay', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => successful(bodyOf(init)))
    fetcher.mockImplementationOnce(async (_url, init) => Response.json({
      ok: false, supersedes_request_key: bodyOf(init).idempotency_key,
      active_request: { owner_id: USER, request_key: KEY, amount_eur: 20, requested_amount_eur: null },
    }, { status: 503 }))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit(); await submit()
    expect(bodyOf(fetcher.mock.calls[1][1])).toEqual({ owner_id: USER, idempotency_key: KEY })
    expect(latest.success?.ok).toBe(true)
  })
  it('a confirmed restoration releases the old intention; an unconfirmed one does not', async () => {
    let restored = false
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => Response.json({
      ok: false, request_id: REQUEST_ID, request_key: bodyOf(init).idempotency_key,
      amount_eur: 20, operation_state: 'rejected', balance_restored: restored, new_balance_eur: 100,
    }, { status: 502 }))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    expect(latest.pending).toBe(true)
    restored = true; await submit()
    expect(latest.pending).toBe(false); expect(localStorage.getItem(keyFor())).toBeNull()
  })
  it('a new explicitly opened request after confirmed success gets a different key', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => successful(bodyOf(init)))
    vi.stubGlobal('fetch', fetcher); await mount(); await submit()
    await act(async () => { latest.resetState(); latest.setAmount('20') })
    await submit()
    expect(bodyOf(fetcher.mock.calls[0][1]).idempotency_key)
      .not.toBe(bodyOf(fetcher.mock.calls[1][1]).idempotency_key)
  })
  it('the actual Connect button remains usable for a stored request at zero balance', async () => {
    localStorage.setItem(keyFor(), JSON.stringify(savedIntent()))
    vi.stubGlobal('fetch', vi.fn())
    await act(async () => { root.render(React.createElement(WithdrawButton, { balanceEur: 0, disabled: true })) })
    const button = element.querySelector<HTMLButtonElement>('[data-testid="withdraw-button"]')!
    expect(button.disabled).toBe(false); expect(button.textContent).toContain('Vérifier')
    await act(async () => { button.click() })
    const input = element.querySelector<HTMLInputElement>('[data-testid="withdraw-amount-input"]')!
    expect(input.value).toBe('20.00'); expect(input.disabled).toBe(true)
  })
  it('unlocks a refused 100-euro intention only after durable cancellation, then uses a new key for 20 euros', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = bodyOf(init)
      if (body.action === 'cancel') return Response.json({ ok: true, operation_state: 'cancelled',
        cancellation_confirmed: true, cancellation_id: REQUEST_ID, owner_id: body.owner_id,
        request_key: body.idempotency_key })
      if (body.amount_eur === 100) return Response.json({ error: 'Plafond 50€', retry_same_request: true }, { status: 403 })
      return successful(body)
    })
    vi.stubGlobal('fetch', fetcher); await mount()
    await act(async () => { latest.setAmount('100') }); await submit()
    expect(latest.pending).toBe(true)
    await act(async () => { latest.setAmount('20') })
    expect(latest.amount).toBe('100.00')
    await act(async () => { await latest.cancel() })
    expect(latest.pending).toBe(false); expect(localStorage.getItem(keyFor())).toBeNull()
    await act(async () => { latest.setAmount('20') }); await submit()
    const bodies = fetcher.mock.calls.map(([, init]) => bodyOf(init))
    expect(bodies[1]).toEqual({ ...bodies[0], action: 'cancel' })
    expect(bodies[2].amount_eur).toBe(20)
    expect(bodies[2].idempotency_key).not.toBe(bodies[0].idempotency_key)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
  it('a lost cancellation response preserves the intention and replays exactly the same cancellation', async () => {
    localStorage.setItem(keyFor(), JSON.stringify(savedIntent()))
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => Response.json({
      ok: true, operation_state: 'cancelled', cancellation_confirmed: true,
      cancellation_id: REQUEST_ID, request_key: bodyOf(init).idempotency_key, owner_id: USER,
    }))
    fetcher.mockRejectedValueOnce(new Error('cancellation acknowledgement lost'))
    vi.stubGlobal('fetch', fetcher); await mount()
    await act(async () => { await latest.cancel() })
    expect(latest.pending).toBe(true)
    await act(async () => { await latest.cancel() })
    expect(bodyOf(fetcher.mock.calls[0][1])).toEqual(bodyOf(fetcher.mock.calls[1][1]))
    expect(latest.pending).toBe(false); expect(onSuccess).not.toHaveBeenCalled()
  })
  it.each(['reserved', 'sending', 'reconciliation'])('an admitted %s request cannot be unlocked by the modify action', async state => {
    localStorage.setItem(keyFor(), JSON.stringify(savedIntent()))
    const fetcher = vi.fn(async () => Response.json({ ok: false, operation_state: state,
      request_key: KEY, retry_same_request: true }, { status: 503 }))
    vi.stubGlobal('fetch', fetcher); await mount()
    await act(async () => { await latest.cancel() })
    expect(latest.pending).toBe(true); expect(localStorage.getItem(keyFor())).toContain(KEY)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
