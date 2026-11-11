// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  history: vi.fn(), fetch: vi.fn(), toast: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toast } }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: () => ({ select: () => ({
  eq: (_column: string, id: string) => ({ order: () => {
    const value = mocks.history(id)
    return { then: value.then.bind(value), abortSignal: () => value }
  } }),
}) }) }) }))
import { useChatMessages } from './useChatMessages'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
type History = { data: { id: string; role: 'user' | 'assistant'; content: string }[] | null; error?: unknown }
function history(content: string): History { return { data: [{ id: content, role: 'user', content }] } }
function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let closed = false
  const cancelled = vi.fn(() => { closed = true })
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c }, cancel: cancelled })
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }), cancelled,
    push(value: string | Uint8Array) { if (!closed) controller.enqueue(typeof value === 'string' ? new TextEncoder().encode(value) : value) },
    close() { if (!closed) { closed = true; controller.close() } },
    finish(text = 'réponse') { if (text) this.push(`data: ${JSON.stringify({ text })}\n\n`); this.push('data: [DONE]\n\n'); this.close() },
  }
}
let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useChatMessages>
let mounted = false
function Harness() { const value = useChatMessages(); useEffect(() => { current = value }); return null }
const refresh = () => Promise.resolve()
function begin(text = 'question', onConversations = refresh, onQuota = refresh) {
  let pending!: Promise<void>
  act(() => { pending = current.sendMessage(text, 'akasha-sonnet', onConversations, onQuota) })
  return pending
}
async function finish(pending: Promise<void>) { await act(async () => { await pending }) }
function texts() { return current.messages.map(m => m.content) }
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.history.mockImplementation(() => Promise.resolve({ data: [] }))
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container); mounted = true
  await act(async () => root.render(createElement(Harness)))
})
afterEach(async () => {
  if (mounted) await act(async () => root.unmount())
  container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks()
})

describe('chat lifecycle regression', () => {
  it('keeps a complete answer and refreshes both independent counters', async () => {
    const s = stream(); s.finish(); mocks.fetch.mockResolvedValue(s.response)
    const a = vi.fn(refresh), b = vi.fn(refresh)
    await finish(begin('question', a, b))
    expect(texts()).toEqual(['question', 'réponse'])
    expect(current.sending).toBe(false); expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce()
  })
  it('late history A cannot replace the already selected history B', async () => {
    const a = deferred<History>(), b = deferred<History>()
    mocks.history.mockImplementation((id: string) => id === 'A' ? a.promise : b.promise)
    let pa!: Promise<void>, pb!: Promise<void>
    act(() => { pa = current.loadConversation('A'); pb = current.loadConversation('B') })
    b.resolve(history('B')); await finish(pb)
    a.resolve(history('A')); await finish(pa)
    expect(current.activeConvId).toBe('B'); expect(texts()).toEqual(['B'])
  })
  it('clearing while history is pending cannot repopulate the blank chat', async () => {
    const a = deferred<History>(); mocks.history.mockReturnValue(a.promise)
    let pa!: Promise<void>; act(() => { pa = current.loadConversation('A') })
    act(() => current.clearMessages()); a.resolve(history('A')); await finish(pa)
    expect(current.messages).toEqual([]); expect(current.activeConvId).toBeNull(); expect(current.loading).toBe(false)
  })
  it('a database error returned as data is visible rather than a false empty success', async () => {
    mocks.history.mockResolvedValue({ data: null, error: { message: 'database secret' } })
    await act(async () => current.loadConversation('A'))
    expect(mocks.toast).toHaveBeenCalled(); expect(current.loading).toBe(false)
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain('database secret')
  })
  it('two synchronous clicks make exactly one paid request', async () => {
    const s = stream(); s.finish(); mocks.fetch.mockResolvedValue(s.response)
    let a!: Promise<void>, b!: Promise<void>
    act(() => { a = current.sendMessage('one', 'akasha-sonnet', refresh, refresh); b = current.sendMessage('two', 'akasha-sonnet', refresh, refresh) })
    await finish(Promise.all([a, b]).then(() => undefined))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
  it('does not send an empty-history request while selected history is loading', async () => {
    const a = deferred<History>(); mocks.history.mockReturnValue(a.promise)
    const s = stream(); s.finish(); mocks.fetch.mockResolvedValue(s.response)
    let pa!: Promise<void>; act(() => { pa = current.loadConversation('A') })
    await finish(begin()); a.resolve(history('A')); await finish(pa)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('late response after clear cannot restore its old conversation identifier', async () => {
    const pending = deferred<Response>(); mocks.fetch.mockReturnValue(pending.promise)
    const pa = begin(); act(() => current.clearMessages())
    const s = stream(); s.push('data: {"conversationId":"old"}\n\n'); s.finish()
    pending.resolve(s.response); await finish(pa)
    expect(current.activeConvId).toBeNull(); expect(current.messages).toEqual([])
  })
  it('clearing an active request aborts its transport', async () => {
    const pending = deferred<Response>(); mocks.fetch.mockReturnValue(pending.promise)
    const pa = begin(); const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal | undefined
    act(() => current.clearMessages())
    const s = stream(); s.finish(); pending.resolve(s.response); await finish(pa)
    expect(signal?.aborted).toBe(true)
  })
  it('completion of an old request cannot unlock a newer pending send', async () => {
    const a = deferred<Response>(), b = deferred<Response>()
    mocks.fetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const pa = begin('old'); act(() => current.clearMessages()); const pb = begin('new')
    const sa = stream(); sa.finish(); a.resolve(sa.response); await finish(pa)
    const stillSending = current.sending
    const sb = stream(); sb.finish(); b.resolve(sb.response); await finish(pb)
    expect(stillSending).toBe(true)
    expect(texts()).toEqual(['new', 'réponse'])
  })
  it('provider error preserves partial text and ignores everything after the error', async () => {
    const s = stream(); s.push('data: {"text":"partiel"}\n\n'); s.push('data: {"error":"Interruption du fournisseur"}\n\n'); s.push('data: {"text":"NE PAS AJOUTER"}\n\n'); s.close()
    mocks.fetch.mockResolvedValue(s.response); await finish(begin())
    expect(texts()).toEqual(['question', 'partiel']); expect(current.sending).toBe(false)
    expect(current.messages.every(m => !m.streaming)).toBe(true)
  })
  it('EOF without the terminal marker is an explicit interruption', async () => {
    const s = stream(); s.push('data: {"text":"partiel"}\n\n'); s.close()
    mocks.fetch.mockResolvedValue(s.response); await finish(begin())
    expect(texts()).toEqual(['question', 'partiel']); expect(mocks.toast).toHaveBeenCalled(); expect(current.sending).toBe(false)
  })
  it('a response without body does not leave an endless assistant spinner', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }))
    await finish(begin()); expect(current.messages.every(m => !m.streaming)).toBe(true); expect(current.sending).toBe(false)
  })
  it('a proxy HTML error retains the submitted question without showing technical details', async () => {
    mocks.fetch.mockResolvedValue(new Response('<html>internal</html>', { status: 502 }))
    await finish(begin()); expect(texts()).toEqual(['question']); expect(mocks.toast).toHaveBeenCalled()
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain('Unexpected token')
  })
  it('429 preserves the server rate-limit reason instead of inventing quota exhaustion', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Trop de requêtes récentes.' }, { status: 429 }))
    await finish(begin()); expect(mocks.toast).toHaveBeenCalledWith('Trop de requêtes récentes.')
  })
  it('refresh rejection cannot erase a valid complete answer or prevent quota refresh', async () => {
    const s = stream(); s.finish(); mocks.fetch.mockResolvedValue(s.response)
    const b = vi.fn(refresh)
    await finish(begin('question', () => Promise.reject(new Error('refresh unavailable')), b))
    expect(texts()).toEqual(['question', 'réponse']); expect(b).toHaveBeenCalledOnce(); expect(current.sending).toBe(false)
  })
  it('DONE is terminal even when extra data arrives in the same network chunk', async () => {
    const s = stream(); s.push('data: {"text":"ok"}\n\ndata: [DONE]\n\ndata: {"text":"BAD"}\n\n'); s.close()
    mocks.fetch.mockResolvedValue(s.response); await finish(begin()); expect(texts()).toEqual(['question', 'ok'])
  })
  it('malformed event is not silently skipped as a successful answer', async () => {
    const s = stream(); s.push('data: INVALID_JSON\n\ndata: [DONE]\n\n'); s.close()
    mocks.fetch.mockResolvedValue(s.response); await finish(begin()); expect(mocks.toast).toHaveBeenCalled(); expect(current.sending).toBe(false)
  })
  it('understands data without a space, multiline data, CRLF and fragmented UTF-8', async () => {
    const s = stream(); const bytes = new TextEncoder().encode(': heartbeat\r\ndata:{"text":\r\ndata: "été 🪷"}\r\n\r\ndata:[DONE]\r\n\r\n')
    for (let i = 0; i < bytes.length; i += 3) s.push(bytes.slice(i, i + 3))
    s.close(); mocks.fetch.mockResolvedValue(s.response); await finish(begin()); expect(texts()).toEqual(['question', 'été 🪷'])
  })
  it('unmount aborts transport and discards late callbacks', async () => {
    const pending = deferred<Response>(); mocks.fetch.mockReturnValue(pending.promise)
    const a = vi.fn(refresh), b = vi.fn(refresh); const pa = begin('question', a, b)
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal | undefined
    await act(async () => root.unmount()); mounted = false
    const s = stream(); s.finish(); pending.resolve(s.response); await finish(pa)
    expect(signal?.aborted).toBe(true); expect(a).not.toHaveBeenCalled(); expect(b).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled()
  })
  it('a stalled response is bounded even if the transport ignores abort', async () => {
    vi.useFakeTimers()
    const late = deferred<Response>(); mocks.fetch.mockReturnValue(late.promise)
    const pending = begin()
    await act(async () => { await vi.advanceTimersByTimeAsync(120_001) })
    const stoppedBeforeResponse = !current.sending
    const s = stream(); s.finish(); late.resolve(s.response); await finish(pending)
    expect(stoppedBeforeResponse).toBe(true)
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('délai'))
  })
  it('a stalled history load is bounded even if the database ignores abort', async () => {
    vi.useFakeTimers()
    const late = deferred<History>(); mocks.history.mockReturnValue(late.promise)
    let pending!: Promise<void>; act(() => { pending = current.loadConversation('A') })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001) })
    const stoppedBeforeResponse = !current.loading
    late.resolve(history('late')); await finish(pending)
    expect(stoppedBeforeResponse).toBe(true); expect(texts()).not.toContain('late')
  })
  it('sequential sends in the same millisecond keep unique message identifiers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const a = stream(), b = stream(); a.finish('first'); b.finish('second')
    mocks.fetch.mockResolvedValueOnce(a.response).mockResolvedValueOnce(b.response)
    await finish(begin('one')); await finish(begin('two'))
    expect(new Set(current.messages.map(m => m.id)).size).toBe(4)
  })
})
