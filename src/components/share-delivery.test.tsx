// @vitest-environment jsdom
import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { A, B, actor, click, deferred, fixture, json, mount } from './async-lifecycle.test-support'
import PartagePage from '@/app/(dashboard)/dashboard/partage/page'
import { clearPendingRequest } from '@/lib/idempotency/browser-request'

const button = (container: HTMLElement) => container.querySelector('.grid.grid-cols-2 button')
const rpcRequests = () => fixture.requests.filter(request => new URL(request.url).pathname === '/rest/v1/rpc/record_social_share')
const receipt = (id: string) => ({ user_id: A, request_id: id, share_id: '00000000-0000-4000-8000-000000000001',
  transaction_id: '00000000-0000-4000-8000-000000000002', share_code: 'ref-a', platform_id: 'whatsapp',
  shared_at: '2026-11-22T12:00:00Z', points: 400, today_shares: 1, replayed: false })
const retry = (container: HTMLElement) => container.querySelector('[data-testid="share-retry"]')
function openedWindow() {
  return { closed: false, opener: window, document: document.implementation.createHTMLDocument(),
    location: { replace: vi.fn() }, close: vi.fn() } as unknown as Window
}
function transport(record: (request: Request) => Promise<Response>, today: () => number = () => 0) {
  fixture.transport.mockImplementation(async request => {
    const path = new URL(request.url).pathname
    if (path === '/rest/v1/rpc/get_social_share_stats') return json({ version: 1, user_id: (fixture.auth.user as { id: string }).id, total_shares: today(), today_shares: today(),
      points_earned: today() * 300 + (today() ? 100 : 0) })
    if (path === '/rest/v1/rpc/record_social_share') return record(request)
    fixture.unexpected.push(request.url); throw new Error('Unexpected share request')
  })
}
beforeEach(() => { Object.assign(fixture.auth.profile as object, { referral_code: 'ref-a' }); sessionStorage.clear(); localStorage.clear() })
afterEach(() => { sessionStorage.clear(); localStorage.clear() })

it('opens the platform inside the click and locks concurrent clicks while confirmation is pending', async () => {
  const pending = deferred<Response>()
  const opened = vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  transport(async () => pending.promise)
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  await click(button(view.container))
  expect(opened).toHaveBeenCalledTimes(1)
  expect(rpcRequests()).toHaveLength(1)
  const sent = await rpcRequests()[0].clone().json()
  await act(async () => { pending.resolve(json(receipt(sent.p_request_id))) })
  expect(fixture.info).toHaveBeenCalledWith(expect.stringContaining('400 points ajoutés à ton solde'))
  expect(fixture.info).toHaveBeenCalledWith(expect.stringContaining('publication sur le réseau n’est pas vérifiée'))
  expect(fixture.error).not.toHaveBeenCalled()
})

it('reuses the request key after a lost confirmation instead of issuing a second reward request', async () => {
  vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  transport(async () => json({ message: 'synthetic loss' }, 503))
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  const first = await rpcRequests()[0].clone().json()
  transport(async request => json({ ...receipt((await request.clone().json()).p_request_id), replayed: true }))
  await click(retry(view.container))
  const second = await rpcRequests()[1].clone().json()
  expect(second.p_request_id).toBe(first.p_request_id)
  expect(fixture.info).toHaveBeenCalledTimes(1)
})

it('does not show an old actor confirmation after switching accounts', async () => {
  const pending = deferred<Response>()
  vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  transport(async () => pending.promise)
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  const sent = await rpcRequests()[0].clone().json()
  actor(B, 'Bob')
  await view.render(<PartagePage />)
  await act(async () => { pending.resolve(json(receipt(sent.p_request_id))) })
  expect(fixture.info).not.toHaveBeenCalled()
  expect(fixture.error).not.toHaveBeenCalled()
})

it('does not credit a cancelled native share and reports a genuine native failure', async () => {
  const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  transport(async () => { throw new Error('Native cancellation must not record') })
  const view = await mount(<PartagePage />)
  try {
    await click(view.container.querySelector('[aria-label="Partager avec mon appareil"]'))
    expect(rpcRequests()).toHaveLength(0)
    expect(fixture.error).not.toHaveBeenCalled()
    share.mockRejectedValue(new Error('synthetic device failure'))
    await click(view.container.querySelector('[aria-label="Partager avec mon appareil"]'))
    expect(rpcRequests()).toHaveLength(0)
    expect(fixture.error).toHaveBeenCalledTimes(1)
  } finally { Reflect.deleteProperty(navigator, 'share') }
})
it('recovers a third share after remount without opening the external platform again', async () => {
  const opened = vi.spyOn(window, 'open').mockReturnValue(openedWindow())
  let today = 2
  transport(async () => json({ message: 'Confirmation lost after commit' }, 503), () => today)
  const firstView = await mount(<PartagePage />)
  await click(button(firstView.container))
  const first = await rpcRequests()[0].clone().json()
  await firstView.unmount()
  const key = `akasha-share-pending/v1/${A}/whatsapp`
  clearPendingRequest(key, first.p_request_id)
  localStorage.removeItem(`akasha:pending-share:v1:${A}`)
  sessionStorage.setItem(key, first.p_request_id)
  today = 3
  transport(async request => json({ ...receipt((await request.clone().json()).p_request_id),
    points: 300, today_shares: 3, replayed: true }), () => today)
  const recovered = await mount(<PartagePage />)
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(true)
  expect((retry(recovered.container) as HTMLButtonElement).disabled).toBe(false)
  await click(retry(recovered.container))
  expect((await rpcRequests()[1].clone().json()).p_request_id).toBe(first.p_request_id)
  expect(opened).toHaveBeenCalledTimes(1)
  expect(fixture.info).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem(key)).toBeNull()
  expect(retry(recovered.container)).toBeNull()
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(true)
})

it('does not send a reward request when the browser refuses the popup', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  transport(async () => { throw new Error('Blocked popup must not record') })
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  expect(rpcRequests()).toHaveLength(0)
  expect(fixture.info).not.toHaveBeenCalled()
  expect(fixture.error).toHaveBeenCalledWith(expect.stringContaining('n’a pas pu être ouverte'))
})
