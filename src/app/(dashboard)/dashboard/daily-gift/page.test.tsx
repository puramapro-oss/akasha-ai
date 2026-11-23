// @vitest-environment jsdom
import React, { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { A, B, actor, click, deferred, fixture, json, mount } from '@/components/async-lifecycle.test-support'
import DailyGiftPage from './page'
import { ASYNC_RESOURCE_TIMEOUT_MS } from '@/hooks/useAsyncResource'

const unopened = { already_opened: false, gift: null, streak: 0 }
const receipt = { id: 'saved-gift', gift_type: 'points', gift_value: '17', label: '17 points enregistrés',
  streak_count: 0, opened_at: '2026-11-22T12:00:00Z' }
const opened = { already_opened: true, gift: receipt, streak: 0 }
const replay = { gift: receipt, streak: 0, replayed: true }
const postRequests = () => fixture.requests.filter(request => request.method === 'POST')
const getRequests = () => fixture.requests.filter(request => request.method === 'GET')
const advance = async (milliseconds: number) => { await act(async () => { vi.advanceTimersByTime(milliseconds) }) }
const open = async (container: HTMLElement) => {
  await click([...container.querySelectorAll('button')].find(button => button.textContent === 'Ouvrir le coffre') ?? null)
  await advance(1200)
}

describe('daily gift confirmation recovery', () => {
  it('uses the confirmed replay without a second POST, lookup or celebration', async () => {
    vi.useFakeTimers()
    fixture.transport.mockImplementation(async request => request.method === 'POST'
      ? json(replay) : json(unopened))
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    expect(postRequests()).toHaveLength(1)
    expect(getRequests()).toHaveLength(1)
    expect(view.container.textContent).toContain(receipt.label)
    expect(view.container.textContent).toContain('Reviens demain')
    expect(view.container.textContent).not.toContain('Ouverture...')
    expect(fixture.error).not.toHaveBeenCalled()
    expect(fixture.success).not.toHaveBeenCalled()
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts a lost POST confirmation at the deadline and ignores its late reply after recovering the commit', async () => {
    vi.useFakeTimers()
    const lost = deferred<Response>()
    let reads = 0
    fixture.transport.mockImplementation(async request => request.method === 'POST'
      ? lost.promise : json(++reads === 1 ? unopened : opened))
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    expect(postRequests()).toHaveLength(1)
    expect(postRequests()[0].signal.aborted).toBe(false)
    await advance(ASYNC_RESOURCE_TIMEOUT_MS)
    expect(postRequests()[0].signal.aborted).toBe(true)
    expect(getRequests()).toHaveLength(2)
    expect(view.container.textContent).toContain(receipt.label)
    expect(view.container.textContent).toContain('Reviens demain')
    await act(async () => { lost.resolve(json({ gift: { ...receipt, label: 'Réponse tardive ignorée' } })) })
    expect(view.container.textContent).not.toContain('Réponse tardive ignorée')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledTimes(1)
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a hanging POST body and a hanging verification read, then retries only the read', async () => {
    vi.useFakeTimers()
    const body = deferred<unknown>()
    const verification = deferred<Response>()
    let reads = 0
    fixture.transport.mockImplementation(async request => {
      if (request.method === 'POST') {
        const response = json({})
        vi.spyOn(response, 'json').mockImplementation(() => body.promise)
        return response
      }
      reads++
      if (reads === 2) return verification.promise
      return json(reads === 1 ? unopened : opened)
    })
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    await advance(ASYNC_RESOURCE_TIMEOUT_MS)
    expect(postRequests()[0].signal.aborted).toBe(true)
    await advance(ASYNC_RESOURCE_TIMEOUT_MS)
    expect(getRequests()[1].signal.aborted).toBe(true)
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Réessayer')
    expect(view.container.textContent).not.toContain('Ouverture...')
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'Réessayer') ?? null)
    expect(view.container.textContent).toContain(receipt.label)
    expect(postRequests()).toHaveLength(1)
    expect(getRequests()).toHaveLength(3)
    await act(async () => {
      body.resolve({ gift: { ...receipt, label: 'Corps tardif ignoré' } })
      verification.resolve(json(unopened))
    })
    expect(view.container.textContent).toContain('Reviens demain')
    expect(view.container.textContent).not.toContain('Corps tardif ignoré')
    expect(fixture.success).not.toHaveBeenCalled()
  })

  it('aborts a pending old-account POST and never publishes its gift or toast to the next account', async () => {
    vi.useFakeTimers()
    const old = deferred<Response>()
    fixture.transport.mockImplementation(async request => request.method === 'POST' ? old.promise
      : json(request.headers.get('authorization') === 'Bearer synthetic-' + B
        ? { ...opened, gift: { ...receipt, label: 'Cadeau de Bob' } } : unopened))
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    actor(B, 'Bob')
    await view.render(<DailyGiftPage />)
    expect(postRequests()[0].signal.aborted).toBe(true)
    expect(view.container.textContent).toContain('Cadeau de Bob')
    await act(async () => { old.resolve(json({ gift: { ...receipt, label: 'Cadeau d’Alice' } })) })
    await advance(ASYNC_RESOURCE_TIMEOUT_MS)
    expect(view.container.textContent).not.toContain('Cadeau d’Alice')
    expect(view.container.textContent).toContain('Cadeau de Bob')
    expect(fixture.error).not.toHaveBeenCalled()
    expect(fixture.success).not.toHaveBeenCalled()
    expect(postRequests()).toHaveLength(1)
    expect(getRequests()).toHaveLength(2)
  })

  it('releases the pending presentation after a token refresh for the same account and uses the new token', async () => {
    vi.useFakeTimers()
    const old = deferred<Response>()
    fixture.transport.mockImplementation(async request => {
      if (request.method === 'GET') return json(unopened)
      return request.headers.get('authorization') === 'Bearer refreshed-' + A
        ? json({ gift: receipt, replayed: false }) : old.promise
    })
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    fixture.auth.session = { access_token: 'refreshed-' + A, user: { id: A } }
    await view.render(<DailyGiftPage />)
    expect(postRequests()[0].signal.aborted).toBe(true)
    expect(view.container.textContent).not.toContain('Ouverture...')
    await open(view.container)
    expect(postRequests()).toHaveLength(2)
    expect(postRequests()[1].headers.get('authorization')).toBe('Bearer refreshed-' + A)
    expect(view.container.textContent).toContain(receipt.label)
    await act(async () => { old.resolve(json(replay)) })
    expect(fixture.success).toHaveBeenCalledTimes(1)
    expect(fixture.error).not.toHaveBeenCalled()
    expect(getRequests()).toHaveLength(2)
  })

  it('recovers a committed gift after an HTTP failure without awarding or celebrating twice', async () => {
    vi.useFakeTimers()
    let reads = 0
    fixture.transport.mockImplementation(async request => request.method === 'POST'
      ? json({ error: 'Confirmation indisponible' }, 503) : json(++reads === 1 ? unopened : opened))
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    expect(postRequests()).toHaveLength(1)
    expect(getRequests()).toHaveLength(2)
    expect(view.container.textContent).toContain(receipt.label)
    expect(view.container.textContent).toContain('Reviens demain')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledTimes(1)
  })

  it('keeps a 202 coupon pending and exposes its reference without a success celebration', async () => {
    vi.useFakeTimers()
    const coupon = { ...receipt, gift_type: 'coupon', gift_value: '20', label: '-20% pendant 3 jours',
      fulfilled_at: null, delivery_status: 'pending_coupon_activation', delivery_details: { code: 'DAILY20-synthetic' } }
    fixture.transport.mockImplementation(async request => request.method === 'POST'
      ? json({ gift: coupon, streak: 0, replayed: false }, 202) : json(unopened))
    const view = await mount(<DailyGiftPage />)
    await open(view.container)
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('activation est en attente')
    expect(view.container.textContent).toContain('DAILY20-synthetic')
    expect(view.container.textContent).toContain('Reviens demain')
    expect(fixture.info).toHaveBeenCalledTimes(1)
    expect(fixture.success).not.toHaveBeenCalled()
    await view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

})
