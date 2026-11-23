// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Socket } from 'node:net'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContactPage from './page'

const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: notifications }))
const ID = '11111111-1111-4111-8111-111111111111'
const saved = (confirmation = 'accepted') => ({ success: true, stored: true, message_id: ID,
  emails: { team: 'accepted', confirmation } })
let root: Root
let container: HTMLDivElement
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>
let pendingReject: ((error: Error) => void) | null
let mounted: boolean
const field = (id: string) => container.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!
async function input(id: string, value: string) {
  await act(async () => {
    const element = field(id)
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit(times = 1) {
  await act(async () => {
    for (let i = 0; i < times; i++) container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((accept, reject) => { resolve = accept; pendingReject = reject })
  fetcher.mockReturnValueOnce(promise)
  return async (body: unknown, status = 200) => {
    await act(async () => { pendingReject = null; resolve(Response.json(body, { status })) })
  }
}
beforeEach(async () => {
  vi.clearAllMocks(); pendingReject = null; mounted = true
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(saved()))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('crypto', { randomUUID: () => ID,
    subtle: { digest: async (_algorithm: string, data: Uint8Array) => Uint8Array.from(createHash('sha256').update(data).digest()).buffer } })
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, run: (lock: object) => Promise<void>) => run({}) } })
  localStorage.clear(); sessionStorage.clear()
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(<ContactPage />) })
  await input('name', 'Mina'); await input('email', 'mina@example.invalid')
  await input('subject', 'Synthetic contact'); await input('message', 'Synthetic body')
})
afterEach(async () => {
  await act(async () => {
    if (mounted) root.unmount()
    pendingReject?.(new Error('Synthetic cleanup'))
  })
  container.remove()
  try { expect(Socket.prototype.connect).not.toHaveBeenCalled() }
  finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() }
})

describe('the contact form follows the registration receipt', () => {
  it('keeps the original operation id after a lost response and reuses it on explicit retry', async () => {
    fetcher.mockRejectedValueOnce(new Error('Synthetic lost response'))
    await submit()
    const first = fetcher.mock.calls[0][1]!
    expect(new Headers(first.headers).get('Idempotency-Key')).toBe(ID)
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toMatch(/^akasha:contact:[a-f0-9]{64}$/)
    expect(JSON.stringify(localStorage)).not.toContain('mina@example.invalid')
    await submit()
    expect(fetcher.mock.calls[1][1]!.body).toBe(first.body)
    expect(new Headers(fetcher.mock.calls[1][1]!.headers).get('Idempotency-Key')).toBe(ID)
    expect(localStorage.length).toBe(0)
    expect(container.querySelector('form')).toBeNull()
  })

  it('refuses a success receipt for another operation and preserves the pending key', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ...saved(), message_id: '22222222-2222-4222-8222-222222222222' }))
    await submit()
    expect(notifications.success).not.toHaveBeenCalled()
    expect(field('message').value).toBe('Synthetic body')
    expect(localStorage.length).toBe(1)
    expect(container.textContent).toContain('peut avoir été enregistré')
  })

  it('retains the original uncertainty and immutable draft after a refused retry', async () => {
    fetcher.mockRejectedValueOnce(new Error('Synthetic lost response'))
    await submit()
    fetcher.mockResolvedValueOnce(Response.json({ stored: false, error: 'Synthetic rate limit' }, { status: 429 }))
    await submit()
    expect(container.textContent).toContain('Synthetic rate limit')
    expect(container.textContent).toContain('peut avoir été enregistré')
    expect(field('message').disabled).toBe(true)
    expect(field('email').disabled).toBe(true)
    expect(new Headers(fetcher.mock.calls[1][1]!.headers).get('Idempotency-Key')).toBe(ID)
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(1)
  })

  it('recognizes an existing operation that appears between fingerprinting and lock acquisition', async () => {
    vi.stubGlobal('navigator', { locks: { request: async (key: string, _options: unknown, run: (lock: object) => Promise<void>) => {
      localStorage.setItem(key, ID)
      return run({})
    } } })
    fetcher.mockResolvedValueOnce(Response.json({ stored: false, error: 'Synthetic rate limit' }, { status: 429 }))
    await submit()
    expect(container.textContent).toContain('peut avoir été enregistré')
    expect(field('message').disabled).toBe(true)
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(1)
  })

  it('keeps the tab intention after another tab clears the common receipt', async () => {
    fetcher.mockRejectedValueOnce(new Error('Synthetic lost response'))
    await submit()
    localStorage.clear()
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222',
      subtle: { digest: async (_algorithm: string, data: Uint8Array) => Uint8Array.from(createHash('sha256').update(data).digest()).buffer } })
    await act(async () => { root.unmount(); root = createRoot(container); root.render(<ContactPage />) })
    await input('name', 'Mina'); await input('email', 'mina@example.invalid')
    await input('subject', 'Synthetic contact'); await input('message', 'Synthetic body')
    await submit()
    expect(new Headers(fetcher.mock.calls[1][1]!.headers).get('Idempotency-Key')).toBe(ID)
    expect(container.querySelector('form')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('keeps a confirmed receipt if the tab storage cannot be removed', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Synthetic cleanup failure') })
    await submit()
    expect(container.querySelector('form')).toBeNull()
    expect(notifications.success).toHaveBeenCalledWith('Message enregistré.')
    expect(notifications.error).not.toHaveBeenCalled()
  })

  it('does not send when durable storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic storage failure') })
    await submit()
    expect(fetcher).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Cet envoi ne peut pas démarrer')
    expect(field('message').value).toBe('Synthetic body')
  })

  it('blocks two submit events in the same React batch before another request starts', async () => {
    const respond = deferred()
    await submit(2)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await respond(saved())
  })

  it('announces the registered reference and partial email status without asking to resend', async () => {
    fetcher.mockResolvedValueOnce(Response.json(saved('unconfirmed')))
    await submit()
    expect(container.textContent).toContain('enregistré')
    expect(container.textContent).toContain(ID)
    expect(container.textContent).toContain('confirmation')
    expect(container.textContent).toContain('non confirmé')
    expect(container.textContent).not.toMatch(/24\s*h/)
    expect(notifications.success.mock.calls.flat().join(' ')).not.toMatch(/24\s*h/)
    expect(container.querySelector('form')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => { container.querySelector<HTMLButtonElement>('[role=status] button')!.click() })
    expect(field('message').value).toBe('')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not accept a generic 200 success response without a registration id', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ success: true }))
    await submit()
    expect(notifications.success).not.toHaveBeenCalled()
    expect(field('message').value).toBe('Synthetic body')
    expect(container.textContent).toContain('peut avoir été enregistré')
  })

  it('does not retry after a lost network response and describes the uncertain registration', async () => {
    fetcher.mockRejectedValueOnce(new Error('Synthetic network loss'))
    await submit()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(field('message').value).toBe('Synthetic body')
    expect(container.textContent).toContain('peut avoir été enregistré')
    expect(notifications.success).not.toHaveBeenCalled()
  })

  it('does not convert an unconfirmed database outcome into a definite lost message', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ success: false, stored: 'unconfirmed' }, { status: 503 }))
    await submit()
    expect(container.textContent).toContain('peut avoir été enregistré')
    expect(field('message').value).toBe('Synthetic body')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('retains the draft and allows correction after a confirmed admission rejection', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ success: false, stored: false, error: 'Synthetic rate limit' }, { status: 429 }))
    await submit()
    expect(container.textContent).toContain('Synthetic rate limit')
    expect(field('message').value).toBe('Synthetic body')
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false)
  })

  it('ignores a response belonging to an unmounted form', async () => {
    const respond = deferred()
    await submit()
    await act(async () => { root.unmount(); mounted = false })
    await respond(saved())
    expect(notifications.success).not.toHaveBeenCalled()
    expect(notifications.error).not.toHaveBeenCalled()
  })

  it('ends a stalled browser request with an uncertain receipt and no automatic retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fetcher.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('Synthetic abort')), { once: true })
    }))
    await submit()
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(45_001) })
    expect(container.textContent).toContain('peut avoir été enregistré')
    expect(field('message').value).toBe('Synthetic body')
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
