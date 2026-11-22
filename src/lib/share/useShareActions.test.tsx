// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { A, B, key, mount, click, confirm, calls, root, actions, reload, copy, rpc, doubles } from './actions.test-support'

it('opens the destination inside the user action before the RPC and prevents a rapid double click', async () => {
  await mount()
  doubles.open.mockImplementation(() => { expect(rpc).not.toHaveBeenCalled(); return true })
  await click(() => { actions.share('whatsapp'); actions.share('whatsapp') })
  expect(doubles.open).toHaveBeenCalledTimes(1)
  expect(navigator.locks.request).toHaveBeenCalledTimes(2)
  expect(doubles.open.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(navigator.locks.request).mock.invocationCallOrder[0])
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(actions.busy).toBe(true)
  expect(localStorage.getItem(key())).not.toBeNull()
  await confirm()
  expect(actions.pending).toBeNull()
  expect(localStorage.getItem(key())).toBeNull()
  expect(doubles.info).toHaveBeenCalledWith(expect.stringContaining('publication sur le réseau n’est pas vérifiée'))
  expect(reload).toHaveBeenCalledTimes(1)
})

it('does not record or award a blocked popup', async () => {
  doubles.open.mockReturnValue(false)
  await mount()
  await click(() => actions.share('whatsapp'))
  expect(rpc).not.toHaveBeenCalled()
  expect(localStorage.getItem(key())).toBeNull()
  expect(actions.busy).toBe(false)
  expect(doubles.error).toHaveBeenCalledWith(expect.stringContaining('n’a pas pu être ouverte'))
})

it('keeps the operation after response loss and replays it without reopening the destination', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  const first = calls[0].args.p_request_id
  await act(async () => calls[0].reject(new Error('Synthetic lost response')))
  expect(actions.pending?.id).toBe(first)
  await click(() => actions.share('telegram'))
  expect(rpc).toHaveBeenCalledTimes(1)
  await click(() => actions.retry())
  expect(calls[1].args.p_request_id).toBe(first)
  expect(doubles.open).toHaveBeenCalledTimes(1)
  await confirm(1, { replayed: true })
  expect(actions.pending).toBeNull()
  expect(doubles.info).toHaveBeenCalledWith(expect.stringContaining('ont été crédités une seule fois'))
})

it('recovers the same pending operation after remount, including after the visible quota is reached', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  const first = calls[0].args.p_request_id
  await act(async () => root.render(null))
  expect(calls[0].signal.aborted).toBe(true)
  await mount(A, 3)
  expect(actions.pending?.id).toBe(first)
  await click(() => actions.retry())
  expect(calls[1].args.p_request_id).toBe(first)
  await confirm(1, { replayed: true })
})

it('never assigns an old account operation or completion to the next account', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  await mount(B)
  await confirm()
  expect(calls[0].signal.aborted).toBe(true)
  expect(actions.pending).toBeNull()
  expect(localStorage.getItem(key(A))).not.toBeNull()
  expect(localStorage.getItem(key(B))).toBeNull()
  expect(reload).not.toHaveBeenCalled()
  expect(doubles.info).not.toHaveBeenCalled()
})

it.each(['AbortError', 'NotAllowedError'])('handles native %s before any tracking call', async name => {
  const share = vi.fn().mockRejectedValue(new DOMException('Synthetic native failure', name))
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  await mount()
  await click(() => actions.nativeShare())
  expect(share).toHaveBeenCalledTimes(1)
  expect(rpc).not.toHaveBeenCalled()
  expect(actions.busy).toBe(false)
  expect(localStorage.getItem(key())).toBeNull()
  if (name === 'AbortError') expect(doubles.info).toHaveBeenCalledWith('Partage annulé ou aucune destination disponible.')
  else expect(doubles.error).toHaveBeenCalledWith(expect.stringContaining('n’a pas pu être transmis'))
})

it('distinguishes a tracking failure after native hand-off from native cancellation', async () => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  await mount()
  await click(() => actions.nativeShare())
  await act(async () => calls[0].resolve({ data: null, error: { code: 'XX000', message: 'Synthetic tracking failure' } }))
  expect(actions.pending).not.toBeNull()
  expect(doubles.error).toHaveBeenCalledWith(expect.stringContaining('Impossible de confirmer'))
  expect(doubles.info).not.toHaveBeenCalledWith('Partage annulé ou aucune destination disponible.')
})

it('does not start a native tracking request after an account switch during the native dialog', async () => {
  let finish!: () => void
  Object.defineProperty(navigator, 'share', { configurable: true,
    value: vi.fn(() => new Promise<void>(resolve => { finish = resolve })) })
  await mount()
  await click(() => actions.nativeShare())
  await mount(B)
  await act(async () => finish())
  expect(rpc).not.toHaveBeenCalled()
  expect(doubles.info).not.toHaveBeenCalled()
})

it('copies without awarding when Web Share is absent', async () => {
  await mount()
  await click(() => actions.nativeShare())
  expect(copy).toHaveBeenCalledTimes(1)
  expect(rpc).not.toHaveBeenCalled()
})

it('does not send an unrepeatable write if browser persistence fails after opening', async () => {
  await mount()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic denied storage') })
  await click(() => actions.share('whatsapp'))
  expect(doubles.open).toHaveBeenCalledTimes(1)
  expect(rpc).not.toHaveBeenCalled()
  expect(actions.storageError).toBe(true)
  expect(actions.busy).toBe(false)
})

it('retains a confirmed operation if removing its local receipt fails, so verification remains idempotent', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Synthetic removal failure') })
  await confirm()
  expect(actions.pending).not.toBeNull()
  expect(actions.storageError).toBe(true)
  expect(reload).toHaveBeenCalledTimes(1)
})

it('clears a definitively rejected quota request without claiming a reward', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  await act(async () => calls[0].resolve({ data: null, error: { code: 'P0001', message: 'maximum 3 shares per UTC day' } }))
  expect(actions.pending).toBeNull()
  expect(doubles.info).not.toHaveBeenCalled()
  expect(doubles.error).toHaveBeenCalledWith(expect.stringContaining('limite de trois'))
})

it('does not open a new destination for a full quota or malformed pending state', async () => {
  await mount(A, 3)
  await click(() => actions.share('whatsapp'))
  expect(doubles.open).not.toHaveBeenCalled()
  await act(async () => root.render(null))
  sessionStorage.setItem(key(), '{invalid')
  await mount()
  expect(actions.storageError).toBe(true)
  await click(() => actions.share('whatsapp'))
  expect(doubles.open).not.toHaveBeenCalled()
})

it('resumes an incoming per-platform key and removes it only after a confirmed replay', async () => {
  const id = '10000000-0000-4000-8000-000000000099'
  const legacy = `akasha-share-pending/v1/${A}/whatsapp`
  sessionStorage.setItem(legacy, id)
  await mount(A, 3)
  expect(actions.pending?.id).toBe(id)
  await click(() => actions.share('telegram'))
  expect(rpc).not.toHaveBeenCalled()
  await click(() => actions.retry())
  expect(calls[0].args.p_request_id).toBe(id)
  expect(sessionStorage.getItem(legacy)).toBe(id)
  expect(doubles.open).not.toHaveBeenCalled()
  await confirm(0, { replayed: true, today_shares: 3 })
  expect(sessionStorage.getItem(legacy)).toBeNull()
  expect(actions.pending).toBeNull()
})

it('keeps separate incoming pending platform keys for sequential safe recovery', async () => {
  const first = '10000000-0000-4000-8000-000000000098', second = '10000000-0000-4000-8000-000000000099'
  sessionStorage.setItem(`akasha-share-pending/v1/${A}/whatsapp`, first)
  sessionStorage.setItem(`akasha-share-pending/v1/${A}/telegram`, second)
  await mount()
  await click(() => actions.retry())
  await confirm(0, { replayed: true })
  expect(actions.pending?.id).toBe(second)
  expect(actions.disabled).toBe(true)
  await click(() => actions.retry())
  expect(calls[1].args.p_request_id).toBe(second)
  await confirm(1, { replayed: true })
  expect(actions.pending).toBeNull()
  expect(doubles.open).not.toHaveBeenCalled()
})

it('imports the former rich session receipt into shared storage without a second UUID', async () => {
  const operation = { id: '10000000-0000-4000-8000-000000000097', userId: A, shareCode: 'ref-a', platformId: 'whatsapp' }
  sessionStorage.setItem(key(), JSON.stringify(operation))
  await mount()
  await click(() => actions.retry())
  expect(calls[0].args.p_request_id).toBe(operation.id)
  expect(localStorage.getItem(key())).toBe(JSON.stringify(operation))
  expect(localStorage.getItem(`akasha-share-pending/v1/${A}/whatsapp`)).toBe(operation.id)
  await confirm(0, { replayed: true })
  expect(sessionStorage.getItem(key())).toBeNull()
  expect(localStorage.getItem(key())).toBeNull()
  expect(doubles.open).not.toHaveBeenCalled()
})

it('recovers shared pending state after remount even if the session storage was cleared', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  const id = calls[0].args.p_request_id
  await act(async () => calls[0].reject(new Error('Synthetic lost response')))
  await act(async () => root.render(null))
  sessionStorage.clear()
  await mount()
  expect(actions.pending?.id).toBe(id)
  await click(() => actions.retry())
  expect(calls[1].args.p_request_id).toBe(id)
  await confirm(1, { replayed: true })
  expect(actions.pending).toBeNull()
})

it('releases both locks after a stalled confirmation and retries its original UUID', async () => {
  await mount()
  vi.useFakeTimers()
  try {
    await click(() => actions.share('whatsapp'))
    const id = calls[0].args.p_request_id
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(calls[0].signal.aborted).toBe(true)
    expect(actions.busy).toBe(false)
    expect(actions.pending?.id).toBe(id)
    await click(() => actions.retry())
    expect(calls).toHaveLength(2)
    expect(calls[1].args.p_request_id).toBe(id)
    await confirm(1, { replayed: true })
    expect(actions.pending).toBeNull()
  } finally { vi.useRealTimers() }
})

it('does not submit or invent a replacement UUID when shared storage silently ignores the imported key', async () => {
  await mount()
  const random = vi.spyOn(crypto, 'randomUUID')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  await click(() => actions.share('whatsapp'))
  expect(random).toHaveBeenCalledTimes(1)
  expect(rpc).not.toHaveBeenCalled()
  expect(actions.busy).toBe(false)
  expect(actions.storageError).toBe(true)
})

it('preserves distinct local and legacy session receipts for the same platform and confirms both UUIDs', async () => {
  const first = { id: '10000000-0000-4000-8000-000000000095', userId: A, shareCode: 'ref-a', platformId: 'whatsapp' }
  const second = { ...first, id: '10000000-0000-4000-8000-000000000096' }
  const canonical = `akasha-share-pending/v1/${A}/whatsapp`
  localStorage.setItem(key(), JSON.stringify(first))
  localStorage.setItem(canonical, first.id)
  sessionStorage.setItem(key(), JSON.stringify(second))
  await mount()
  expect(actions.pending?.id).toBe(first.id)
  await click(() => actions.retry())
  await confirm(0, { replayed: true })
  expect(actions.pending?.id).toBe(second.id)
  expect(sessionStorage.getItem(key())).toBe(JSON.stringify(second))
  await click(() => actions.retry())
  expect(calls).toHaveLength(2)
  expect(calls[1].args.p_request_id).toBe(second.id)
  await confirm(1, { replayed: true, points: 300 })
  expect(actions.pending).toBeNull()
  expect(sessionStorage.getItem(key())).toBeNull()
  expect(localStorage.getItem(key())).toBeNull()
  expect(localStorage.getItem(canonical)).toBeNull()
  expect(doubles.open).not.toHaveBeenCalled()
})
