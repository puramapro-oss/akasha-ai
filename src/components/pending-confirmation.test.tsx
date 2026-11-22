// @vitest-environment jsdom
import React, { act } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { A, click, deferred, fixture, json, mount, shareStats } from './async-lifecycle.test-support'
import PartagePage from '@/app/(dashboard)/dashboard/partage/page'
import BoutiquePage from '@/app/(dashboard)/dashboard/boutique/page'

const shareButton = (view: Awaited<ReturnType<typeof mount>>) => view.container.querySelector('.grid.grid-cols-2 button')
const buyButton = (view: Awaited<ReturnType<typeof mount>>) => view.container.querySelector('[data-testid="btn-buy-credits-10"]')
const posts = () => fixture.requests.filter(request => request.method === 'POST')
const retryShare = (view: Awaited<ReturnType<typeof mount>>) => view.container.querySelector('[data-testid="share-retry"]')
function openedWindow() {
  return { closed: false, opener: window, document: document.implementation.createHTMLDocument(),
    location: { replace: vi.fn() }, close: vi.fn() } as unknown as Window
}
beforeEach(() => { Object.assign(fixture.auth.profile as object, { referral_code: 'ref-a' }) })
const shareReceipt = (id: string) => ({ user_id: A, request_id: id, share_id: '20000000-0000-4000-8000-000000000001',
  transaction_id: '30000000-0000-4000-8000-000000000001', share_code: 'ref-a', platform_id: 'whatsapp',
  shared_at: '2026-11-22T12:00:00Z', points: 400, today_shares: 1, replayed: true })

it('coordinates two share views and retries the retained request after an uncertain response', async () => {
  const response = deferred<Response>()
  const opened = vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats() : response.promise)
  const one = await mount(<PartagePage />), two = await mount(<PartagePage />)
  await click(shareButton(one)); await click(retryShare(two))
  expect(posts()).toHaveLength(1)
  expect(opened).toHaveBeenCalledOnce()
  expect(fixture.error).toHaveBeenCalledWith('Cette demande est déjà en cours dans un autre onglet. Réessaie après sa confirmation.')
  const first = await posts()[0].clone().json()
  await act(async () => { response.resolve(json({ message: 'Response lost' }, 503)) })
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats()
    : json(shareReceipt((await request.clone().json()).p_request_id)))
  await click(retryShare(two))
  expect(posts()).toHaveLength(2)
  expect((await posts()[1].clone().json()).p_request_id).toBe(first.p_request_id)
  expect(localStorage.getItem(`akasha-share-pending/v1/${A}/whatsapp`)).toBeNull()
})

it('preserves a share request after remount even when session storage is cleared', async () => {
  vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats() : json({ message: 'Lost' }, 503))
  const one = await mount(<PartagePage />)
  await click(shareButton(one))
  const first = await posts()[0].clone().json()
  await one.unmount(); sessionStorage.clear()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats()
    : json(shareReceipt((await request.clone().json()).p_request_id)))
  const two = await mount(<PartagePage />)
  await click(retryShare(two))
  expect((await posts()[1].clone().json()).p_request_id).toBe(first.p_request_id)
})

it('does not request a credit when persistent recovery storage is refused', async () => {
  vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied') })
  fixture.transport.mockImplementation(async () => shareStats())
  const view = await mount(<PartagePage />)
  await click(shareButton(view))
  expect(posts()).toHaveLength(0)
  expect(fixture.info).not.toHaveBeenCalled()
  expect(fixture.error).toHaveBeenCalledWith('La reprise ne peut pas être enregistrée dans ce navigateur. Aucune nouvelle attribution n’a été demandée.')
  expect((shareButton(view) as HTMLButtonElement).disabled).toBe(false)
})

it('reports a native tracking failure separately from cancellation of the native dialog', async () => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? shareStats() : json({ message: 'Database cancelled', code: '42501' }, 403))
  const view = await mount(<PartagePage />)
  await click(view.container.querySelector('[aria-label="Partager avec mon appareil"]'))
  expect(posts()).toHaveLength(1)
  expect(fixture.error).toHaveBeenCalledOnce()
  expect(fixture.info).not.toHaveBeenCalled()
})

it('releases the purchase form after storage refusal without sending a debit request', async () => {
  const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied') })
  fixture.transport.mockImplementation(async () => json({ balance: 2000 }))
  const view = await mount(<BoutiquePage />)
  await click(buyButton(view))
  expect(posts()).toHaveLength(0)
  expect((buyButton(view) as HTMLButtonElement).disabled).toBe(false)
  denied.mockRestore()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 2000 })
    : json({ fulfilled: true, item_id: 'credits-10', request_id: (await request.clone().json()).request_id, new_balance: 0 }))
  await click(buyButton(view))
  expect(posts()).toHaveLength(1)
  expect(fixture.success).toHaveBeenCalledOnce()
})

it('bounds a stalled purchase response body and keeps the same request for confirmation', async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller } })
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 2000 })
    : new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const view = await mount(<BoutiquePage />)
  vi.useFakeTimers()
  await click(buyButton(view))
  const first = await posts()[0].clone().json()
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(fixture.success).not.toHaveBeenCalled()
  expect((buyButton(view) as HTMLButtonElement).disabled).toBe(false)
  expect(posts()[0].signal.aborted).toBe(true)
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 2000 })
    : json({ fulfilled: true, item_id: 'credits-10', request_id: (await request.clone().json()).request_id, new_balance: 0 }))
  await click(buyButton(view))
  expect((await posts()[1].clone().json()).request_id).toBe(first.request_id)
  await act(async () => { body.enqueue(new TextEncoder().encode('{}')); body.close() })
  expect(fixture.success).toHaveBeenCalledOnce()
})

it('refuses a second purchase view while another view holds the confirmation lock', async () => {
  const response = deferred<Response>()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 2000 }) : response.promise)
  const one = await mount(<BoutiquePage />), two = await mount(<BoutiquePage />)
  await click(buyButton(one)); await click(buyButton(two))
  expect(posts()).toHaveLength(1)
  expect(fixture.error).toHaveBeenCalledWith('Cette demande est déjà en cours dans un autre onglet. Réessaie après sa confirmation.')
  await act(async () => { response.resolve(json({ error: 'Response lost' }, 503)) })
})

it('keeps external sharing available without issuing an uncoordinated credit when locks are unavailable', async () => {
  const opened = vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  vi.stubGlobal('navigator', {})
  fixture.transport.mockImplementation(async () => shareStats())
  const view = await mount(<PartagePage />)
  await click(shareButton(view))
  expect(opened).toHaveBeenCalledOnce()
  expect(posts()).toHaveLength(0)
  expect(fixture.error).toHaveBeenCalledOnce()
})
