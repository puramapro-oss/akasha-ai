// @vitest-environment jsdom
import React, { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { A, B, actor, click, deferred, fixture, json, mount, shareStats } from './async-lifecycle.test-support'
import PartagePage from '@/app/(dashboard)/dashboard/partage/page'
import { clearPendingRequest } from '@/lib/idempotency/browser-request'

const button = (container: HTMLElement) => container.querySelector('.grid.grid-cols-2 button')
const rpcRequests = () => fixture.requests.filter(request => new URL(request.url).pathname === '/rest/v1/rpc/record_social_share')
const receipt = (id: string) => ({ user_id: A, request_id: id, share_id: '00000000-0000-4000-8000-000000000001',
  points: 400, today_shares: 1, replayed: false })
afterEach(() => { sessionStorage.clear(); localStorage.clear() })

it('opens the platform inside the click and locks concurrent clicks while confirmation is pending', async () => {
  const pending = deferred<Response>()
  const opened = vi.spyOn(window, 'open').mockReturnValue(null)
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats() : pending.promise)
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  await click(button(view.container))
  expect(opened).toHaveBeenCalledTimes(1)
  expect(rpcRequests()).toHaveLength(1)
  const sent = await rpcRequests()[0].clone().json()
  await act(async () => { pending.resolve(json(receipt(sent.p_request_id))) })
  expect(fixture.info).toHaveBeenCalledWith('Suivi du partage confirmé. Les points figurent dans ton solde.')
  expect(fixture.error).not.toHaveBeenCalled()
})

it('reuses the request key after a lost confirmation instead of issuing a second reward request', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats() : json({ message: 'synthetic loss' }, 503))
  const view = await mount(<PartagePage />)
  await click(button(view.container))
  const first = await rpcRequests()[0].clone().json()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats()
    : json({ ...receipt((await request.clone().json()).p_request_id), replayed: true }))
  await click(button(view.container))
  const second = await rpcRequests()[1].clone().json()
  expect(second.p_request_id).toBe(first.p_request_id)
  expect(fixture.info).toHaveBeenCalledTimes(1)
})

it('does not show an old actor confirmation after switching accounts', async () => {
  const pending = deferred<Response>()
  vi.spyOn(window, 'open').mockReturnValue(null)
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats() : pending.promise)
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
  fixture.transport.mockImplementation(async () => shareStats())
  const view = await mount(<PartagePage />)
  try {
    await click(view.container.querySelector('[aria-label="Partager avec cet appareil"]'))
    expect(rpcRequests()).toHaveLength(0)
    expect(fixture.error).not.toHaveBeenCalled()
    share.mockRejectedValue(new Error('synthetic device failure'))
    await click(view.container.querySelector('[aria-label="Partager avec cet appareil"]'))
    expect(rpcRequests()).toHaveLength(0)
    expect(fixture.error).toHaveBeenCalledTimes(1)
  } finally { Reflect.deleteProperty(navigator, 'share') }
})
it('recovers a third share after remount without opening the external platform again', async () => {
  const opened = vi.spyOn(window, 'open').mockReturnValue(null)
  const existing = Array.from({ length: 2 }, (_, i) => ({ id: `share-${i}`, points_given: i ? 300 : 400,
    shared_at: new Date().toISOString() }))
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? shareStats(existing.length, existing.length, existing.reduce((sum, row) => sum + row.points_given, 0)) : json({ message: 'Confirmation lost after commit' }, 503))
  const firstView = await mount(<PartagePage />)
  await click(button(firstView.container))
  const first = await rpcRequests()[0].clone().json()
  await firstView.unmount()
  const key = `akasha-share-pending/v1/${A}/whatsapp`
  clearPendingRequest(key, first.p_request_id)
  sessionStorage.setItem(key, first.p_request_id)
  existing.push({ id: 'share-2', points_given: 300, shared_at: new Date().toISOString() })
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? shareStats(existing.length, existing.length, existing.reduce((sum, row) => sum + row.points_given, 0))
    : json({ ...receipt((await request.clone().json()).p_request_id), points: 300, today_shares: 3, replayed: true }))
  const recovered = await mount(<PartagePage />)
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(false)
  expect(button(recovered.container)?.textContent).toContain('Vérifier')
  await click(button(recovered.container))
  expect((await rpcRequests()[1].clone().json()).p_request_id).toBe(first.p_request_id)
  expect(opened).toHaveBeenCalledTimes(1)
  expect(fixture.info).toHaveBeenCalledTimes(1)
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(true)
})
