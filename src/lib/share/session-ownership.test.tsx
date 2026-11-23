// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { A, key, mount, click, confirm, calls, root, actions, rpc, doubles } from './actions.test-support'

it.each([1, 2])('does not persist or submit after unmount during Web Lock acquisition %i', async acquisition => {
  let grant!: () => void
  const waiting = new Promise<void>(resolve => { grant = resolve })
  let requested = 0
  vi.mocked(navigator.locks.request).mockImplementation(async <T,>(name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>, callback?: LockGrantedCallback<T>) => {
    if (++requested === acquisition) await waiting
    expect(optionsOrCallback).toEqual({ ifAvailable: true })
    return callback!({ name, mode: 'exclusive' })
  })
  await mount()
  await click(() => actions.share('whatsapp'))
  expect(doubles.open).toHaveBeenCalledTimes(1)
  await act(async () => root.render(null))
  await act(async () => grant())
  expect(rpc).not.toHaveBeenCalled()
  expect(localStorage.getItem(key())).toBeNull()
  expect(localStorage.getItem(`akasha-share-pending/v1/${A}/whatsapp`)).toBeNull()
  expect(requested).toBe(acquisition)
  expect(doubles.info).not.toHaveBeenCalled()
})

it('retains the intended actor UUID after the checked RPC reports a stale session', async () => {
  await mount()
  await click(() => actions.share('whatsapp'))
  const id = calls[0].args.p_request_id
  expect(calls[0].args.p_expected_user_id).toBe(A)
  await act(async () => calls[0].resolve({ data: null,
    error: { code: '42501', message: 'AKASHA_SHARE_SESSION_MISMATCH' } }))
  expect(actions.pending?.id).toBe(id)
  expect(doubles.info).not.toHaveBeenCalled()
  await click(() => actions.retry())
  expect(calls[1].args.p_request_id).toBe(id)
  await confirm(1, { replayed: true })
  expect(actions.pending).toBeNull()
})
