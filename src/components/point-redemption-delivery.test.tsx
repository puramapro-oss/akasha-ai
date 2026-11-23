// @vitest-environment jsdom
import React, { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { A, B, click, deferred, fixture, json, mount } from './async-lifecycle.test-support'
import BoutiquePage from '@/app/(dashboard)/dashboard/boutique/page'
import { clearPendingRequest } from '@/lib/idempotency/browser-request'

const button = (container: HTMLElement) => container.querySelector('[data-testid="btn-buy-credits-10"]')
const purchases = () => fixture.requests.filter(request => new URL(request.url).pathname === '/api/points/redeem')
const accepted = (request: Request, balance = 8000) => request.clone().json().then(body => ({
  success: true, fulfilled: true, user_id: A, item_id: body.item_id, request_id: body.request_id,
  new_balance: balance, purchase_id: 'synthetic-purchase',
}))
afterEach(() => { sessionStorage.clear(); localStorage.clear() })

it('keeps unsupported rewards visible but unavailable without a debit request', async () => {
  fixture.transport.mockImplementation(async () => json({ balance: 100000 }))
  const view = await mount(<BoutiquePage />)
  for (const id of ['red-10', 'sub-1m', 'cash-250']) {
    const control = view.container.querySelector(`[data-testid="btn-buy-${id}"]`) as HTMLButtonElement
    expect(control.disabled).toBe(true)
    expect(control.textContent).toBe('Indisponible')
    await click(control)
  }
  expect(purchases()).toHaveLength(0)
})
it('locks a double click and displays the confirmed balance only after real fulfillment', async () => {
  const pending = deferred<Response>()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 10000 }) : pending.promise)
  const view = await mount(<BoutiquePage />)
  await click(button(view.container)); await click(button(view.container))
  expect(purchases()).toHaveLength(1)
  expect(await purchases()[0].clone().json()).toMatchObject({ item_id: 'credits-10', cost: 2000, request_id: expect.any(String), expected_user_id: A })
  expect(fixture.success).not.toHaveBeenCalled()
  await act(async () => { pending.resolve(json(await accepted(purchases()[0], 7500))) })
  expect(fixture.success).toHaveBeenCalledWith('+10 credits IA ajouté à ton compte.')
  expect(view.container.textContent?.replaceAll(/\s/g, '')).toContain('7500points')
})
it('keeps the same request id after a missing response and retries the existing purchase', async () => {
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 10000 }) : json({ error: 'Confirmation unavailable' }, 503))
  const view = await mount(<BoutiquePage />)
  await click(button(view.container))
  const first = await purchases()[0].clone().json()
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 10000 }) : json(await accepted(request)))
  await click(button(view.container))
  expect((await purchases()[1].clone().json()).request_id).toBe(first.request_id)
  expect(fixture.success).toHaveBeenCalledTimes(1)
})
it('does not announce delivery on an unconfirmed HTTP success', async () => {
  fixture.transport.mockImplementation(async request => request.method === 'GET' ? json({ balance: 10000 }) : json({ success: true, new_balance: 8000 }))
  const view = await mount(<BoutiquePage />)
  await click(button(view.container))
  expect(fixture.success).not.toHaveBeenCalled()
  expect(fixture.error).toHaveBeenCalled()
  expect(view.container.textContent?.replaceAll(/\s/g, '')).toContain('10000points')
})
it('recovers a committed purchase after remount even when its debit exhausted the balance', async () => {
  let committed = false
  fixture.transport.mockImplementation(async request => {
    if (request.method === 'GET') return json({ balance: committed ? 0 : 2000 })
    committed = true
    return json({ error: 'Confirmation lost after commit' }, 503)
  })
  const firstView = await mount(<BoutiquePage />)
  await click(button(firstView.container))
  const first = await purchases()[0].clone().json()
  await firstView.unmount()
  const key = `akasha-redemption-pending/v1/${A}/credits-10`
  clearPendingRequest(key, first.request_id)
  sessionStorage.setItem(key, first.request_id)
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? json({ balance: 0 }) : json(await accepted(request, 0)))
  const recovered = await mount(<BoutiquePage />)
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(false)
  expect(button(recovered.container)?.textContent).toBe('Vérifier la remise')
  await click(button(recovered.container))
  expect((await purchases()[1].clone().json()).request_id).toBe(first.request_id)
  expect(fixture.success).toHaveBeenCalledTimes(1)
  expect((button(recovered.container) as HTMLButtonElement).disabled).toBe(true)
})

it.each([undefined, B])('preserves the intention when a success receipt has no matching owner: %s', async user_id => {
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? json({ balance: 10000 }) : json({ ...await accepted(request), user_id }))
  const view = await mount(<BoutiquePage />)
  await click(button(view.container))
  const first = await purchases()[0].clone().json()
  const key = `akasha-redemption-pending/v1/${A}/credits-10`
  expect(first.expected_user_id).toBe(A)
  expect(fixture.success).not.toHaveBeenCalled()
  expect(fixture.error).toHaveBeenCalledWith('Remise non confirmée')
  expect(view.container.textContent?.replaceAll(/\s/g, '')).toContain('10000points')
  expect(localStorage.getItem(key)).toBe(first.request_id)
  fixture.transport.mockImplementation(async request => request.method === 'GET'
    ? json({ balance: 10000 }) : json(await accepted(request)))
  await click(button(view.container))
  expect((await purchases()[1].clone().json()).request_id).toBe(first.request_id)
  expect(fixture.success).toHaveBeenCalledOnce()
  expect(localStorage.getItem(key)).toBeNull()
})
