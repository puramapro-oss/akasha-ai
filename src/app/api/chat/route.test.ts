import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a', email: 'a@example.com' } as { id: string; email: string } | null,
  limit: vi.fn(async () => ({ success: true })),
  stream: vi.fn(),
  calls: [] as { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[],
  handlers: {} as Record<string, (op: string, payload: unknown, filters: [string, unknown][]) => unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
}))
vi.mock('@/lib/rate-limit', () => ({ ratelimitCreative: { limit: mocks.limit } }))
vi.mock('@/lib/constants', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/constants')>(),
  PLAN_LIMITS: { free: { daily_questions: 3 } },
  SUPER_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/claude', () => ({ streamClaude: mocks.stream, getSystemPrompt: () => 'sys' }))
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from(table: string) {
      const state = { table, op: 'select', payload: undefined as unknown, filters: [] as [string, unknown][] }
      const run = () => {
        mocks.calls.push({ ...state })
        return Promise.resolve(mocks.handlers[table]?.(state.op, state.payload, state.filters) ?? { data: null, error: null })
      }
      const builder = {
        select() { return builder },
        insert(payload: unknown) { state.op = 'insert'; state.payload = payload; return builder },
        update(payload: unknown) { state.op = 'update'; state.payload = payload; return builder },
        eq(column: string, value: unknown) { state.filters.push([column, value]); return builder },
        single() { return builder },
        maybeSingle() { return builder },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) { return run().then(onFulfilled, onRejected) },
      }
      return builder
    },
  }),
}))

import { POST, CHAT_ERRORS, UPSTREAM_TIMEOUT_MS } from './route'

const CONV = '11111111-1111-4111-8111-111111111111'

function request(body: unknown, signal?: AbortSignal): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal,
  })
}

async function readSse(res: Response, options: { cancelAfter?: number } = {}): Promise<unknown[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const events: unknown[] = []
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n'); buffer = parts.pop() ?? ''
    for (const part of parts) {
      const raw = part.replace(/^data: /, '')
      events.push(raw === '[DONE]' ? '[DONE]' : JSON.parse(raw))
    }
    if (options.cancelAfter !== undefined && events.filter(e => typeof e === 'object' && e !== null && 'text' in e).length >= options.cancelAfter) {
      await reader.cancel()
      break
    }
  }
  return events
}

function inserts(table: string) { return mocks.calls.filter(c => c.table === table && c.op === 'insert').map(c => c.payload as Record<string, unknown>) }
function updates(table: string) { return mocks.calls.filter(c => c.table === table && c.op === 'update').map(c => c.payload as Record<string, unknown>) }

function chunks(texts: string[], options: { failAfter?: number; hang?: boolean } = {}) {
  return async function* (_m: unknown, _p: unknown, _s: unknown, _model: unknown, signal: AbortSignal) {
    for (const [index, text] of texts.entries()) {
      if (options.failAfter === index) throw new Error('provider exploded: secret-detail')
      if (signal.aborted) throw new Error('aborted')
      yield text
    }
    if (options.hang) {
      await new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    }
  }
}

beforeEach(() => {
  mocks.user = { id: 'user-a', email: 'a@example.com' }
  mocks.calls.length = 0
  mocks.limit.mockResolvedValue({ success: true })
  mocks.handlers = {
    profiles: () => ({ data: { plan: 'free', email: 'a@example.com' } }),
    conversations: (op, _payload, filters) => op === 'insert'
      ? { data: { id: CONV } }
      : { data: filters.some(([c, v]) => c === 'user_id' && v === 'user-a') && filters.some(([c, v]) => c === 'id' && v === CONV) ? { id: CONV } : null },
    usage_daily: (() => {
      let chatCount = 1
      return (op: string, payload: unknown) => {
        if (op === 'update') chatCount = (payload as { chat_count: number }).chat_count
        return op === 'select' ? { data: { chat_count: chatCount } } : { data: null, error: null }
      }
    })(),
    messages: () => ({ data: null, error: null }),
  }
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('POST /api/chat — parcours conversation', () => {
  it('refuse en français sans session, sans toucher au modèle', async () => {
    mocks.user = null
    const res = await POST(request({ messages: [{ role: 'user', content: 'Bonjour' }] }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: CHAT_ERRORS.unauthorized })
    expect(mocks.stream).not.toHaveBeenCalled()
  })

  it("refuse une conversation qui n'appartient pas à l'utilisateur avant toute écriture", async () => {
    mocks.stream.mockImplementation(chunks(['x']))
    const res = await POST(request({ messages: [{ role: 'user', content: 'Bonjour' }], conversationId: '22222222-2222-4222-8222-222222222222' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: CHAT_ERRORS.conversationNotFound })
    expect(inserts('messages')).toHaveLength(0)
    expect(updates('usage_daily')).toHaveLength(0)
    expect(mocks.stream).not.toHaveBeenCalled()
  })

  it('bloque au quota en français avant de réserver une unité', async () => {
    mocks.handlers.usage_daily = () => ({ data: { chat_count: 3 } })
    const res = await POST(request({ messages: [{ role: 'user', content: 'Bonjour' }] }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: CHAT_ERRORS.quota, code: 'quota_exceeded', limit: 3, used: 3 })
    expect(updates('usage_daily')).toHaveLength(0)
    expect(mocks.stream).not.toHaveBeenCalled()
  })

  it('diffuse, persiste la réponse complète et consomme exactement une unité', async () => {
    mocks.stream.mockImplementation(chunks(['Bon', 'jour']))
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }], conversationId: CONV }))
    expect(res.status).toBe(200)
    expect(await readSse(res)).toEqual([{ conversationId: CONV }, { text: 'Bon' }, { text: 'jour' }, '[DONE]'])
    expect(inserts('messages')).toEqual([
      { conversation_id: CONV, role: 'user', content: 'Salut' },
      { conversation_id: CONV, role: 'assistant', content: 'Bonjour', model: 'akasha-sonnet' },
    ])
    expect(updates('usage_daily')).toEqual([{ chat_count: 2 }])
  })

  it('signale en français une panne amont avant le premier jeton et libère la réservation de quota', async () => {
    mocks.stream.mockImplementation(chunks(['never'], { failAfter: 0 }))
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }], conversationId: CONV }))
    const events = await readSse(res)
    expect(events).toEqual([{ conversationId: CONV }, { error: CHAT_ERRORS.upstream, code: 'upstream' }, '[DONE]'])
    expect(JSON.stringify(events)).not.toContain('secret-detail')
    expect(inserts('messages').filter(m => m.role === 'assistant')).toHaveLength(0)
    expect(updates('usage_daily')).toEqual([{ chat_count: 2 }, { chat_count: 1 }])
  })

  it("annule le flux amont quand le client se déconnecte et persiste ce qui a été montré", async () => {
    let seen: AbortSignal | undefined
    mocks.stream.mockImplementation((...args: unknown[]) => { seen = args[4] as AbortSignal; return chunks(['A', 'B', 'C'], { hang: true })(...(args as [unknown, unknown, unknown, unknown, AbortSignal])) })
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }], conversationId: CONV }))
    const events = await readSse(res, { cancelAfter: 1 })
    expect(events[1]).toEqual({ text: 'A' })
    await vi.waitFor(() => expect(seen?.aborted).toBe(true))
    await vi.waitFor(() => expect(inserts('messages').filter(m => m.role === 'assistant')).toHaveLength(1))
    expect(inserts('messages').at(-1)).toMatchObject({ role: 'assistant' })
    expect(String(inserts('messages').at(-1)!.content).startsWith('A')).toBe(true)
    expect(updates('usage_daily')).toEqual([{ chat_count: 2 }])
  })

  it('coupe un modèle qui ne répond plus et le dit en français', async () => {
    vi.useFakeTimers()
    mocks.stream.mockImplementation(chunks([], { hang: true }))
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }], conversationId: CONV }))
    const reading = readSse(res)
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS)
    const events = await reading
    expect(events).toEqual([{ conversationId: CONV }, { error: CHAT_ERRORS.timeout, code: 'timeout' }, '[DONE]'])
    expect(updates('usage_daily')).toEqual([{ chat_count: 2 }, { chat_count: 1 }])
  })

  it("prévient quand la réponse n'a pas pu être enregistrée, sans la perdre côté client", async () => {
    mocks.stream.mockImplementation(chunks(['ok']))
    mocks.handlers.messages = (_op, payload) => (payload as { role: string }).role === 'assistant' ? { error: { message: 'db down' } } : { error: null }
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }], conversationId: CONV }))
    const events = await readSse(res)
    expect(events).toEqual([{ conversationId: CONV }, { text: 'ok' }, { persisted: false, error: CHAT_ERRORS.notPersisted, code: 'not_persisted' }, '[DONE]'])
    expect(JSON.stringify(events)).not.toContain('db down')
  })

  it("renvoie une erreur serveur générique en français sans détail interne", async () => {
    mocks.limit.mockRejectedValueOnce(new Error('redis exploded'))
    const res = await POST(request({ messages: [{ role: 'user', content: 'Salut' }] }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: CHAT_ERRORS.server })
  })
})
