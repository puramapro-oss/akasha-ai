import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const fixture = vi.hoisted(() => ({
  plan: 'free', authenticated: true, limited: false,
  reads: [] as string[], writes: [] as string[], calls: [] as string[],
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: fixture.authenticated ? { id: 'fixture-user' } : null } }) },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      fixture.reads.push(table)
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: table === 'profiles' ? { plan: fixture.plan } : { id: 'fixture-conversation' } }),
        maybeSingle: async () => ({ data: { chat_count: 0 } }),
        insert: () => { fixture.writes.push(`insert:${table}`); return query },
        update: () => { fixture.writes.push(`update:${table}`); return query },
      }
      return query
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  ratelimitCreative: { limit: async () => ({ success: !fixture.limited }) },
}))

vi.mock('@/lib/claude', () => ({
  getSystemPrompt: () => 'fixture prompt',
  streamClaude: async function* (_messages: unknown, _plan: unknown, _prompt: unknown, model: string) {
    fixture.calls.push(model)
    yield 'réponse de test'
  },
}))

import { POST } from '../../src/app/api/chat/route'

beforeEach(() => {
  fixture.plan = 'free'
  fixture.authenticated = true
  fixture.limited = false
  fixture.reads.length = 0
  fixture.writes.length = 0
  fixture.calls.length = 0
  vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden') })
})
afterEach(() => { vi.unstubAllGlobals() })

async function request(model?: unknown) {
  const body: Record<string, unknown> = { messages: [{ role: 'user', content: 'bonjour' }] }
  if (model !== undefined) body.model = model
  const response = await POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  }))
  return { response, text: await response.text() }
}

describe('chat model admission', () => {
  for (const model of ['', 'unknown', '__proto__', 'constructor', 'AKASHA-OPUS', 'akasha-opus ']) {
    it(`refuses ${JSON.stringify(model)} before business writes, daily quota debit or provider`, async () => {
      const { response, text } = await request(model)
      expect(response.status).toBe(400)
      expect(JSON.parse(text).code).toBe('INVALID_MODEL')
      expect(fixture.reads).toEqual([])
      expect(fixture.writes).toEqual([])
      expect(fixture.calls).toEqual([])
    })
  }

  it('refuses Opus/free before messages and daily usage are touched', async () => {
    const { response, text } = await request('akasha-opus')
    expect(response.status).toBe(403)
    expect(JSON.parse(text).code).toBe('MODEL_UNAVAILABLE')
    expect(fixture.reads).toEqual(['profiles'])
    expect(fixture.writes).toEqual([])
    expect(fixture.calls).toEqual([])
  })

  for (const plan of ['automate', 'create', 'build', 'complete']) {
    it(`preserves existing Opus access for ${plan}`, async () => {
      fixture.plan = plan
      const { response, text } = await request('akasha-opus')
      expect(response.status).toBe(200)
      expect(text).toContain('réponse de test')
      expect(fixture.calls).toEqual(['akasha-opus'])
    })
  }

  it('preserves the API default when model is omitted', async () => {
    const { response } = await request()
    expect(response.status).toBe(200)
    expect(fixture.calls).toEqual(['akasha-sonnet'])
  })

  it('keeps explicit Haiku on a paid plan', async () => {
    fixture.plan = 'complete'
    const { response } = await request('akasha-haiku')
    expect(response.status).toBe(200)
    expect(fixture.calls).toEqual(['akasha-haiku'])
  })

  it('does not treat an unrecognised profile plan as Opus access', async () => {
    fixture.plan = 'unknown'
    const { response } = await request('akasha-opus')
    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
    expect(fixture.writes).toEqual([])
  })

  it('preserves authentication before any model work', async () => {
    fixture.authenticated = false
    const { response } = await request('akasha-sonnet')
    expect(response.status).toBe(401)
    expect(fixture.reads).toEqual([])
    expect(fixture.calls).toEqual([])
  })

  it('preserves the existing rate limiter', async () => {
    fixture.limited = true
    const { response } = await request('akasha-sonnet')
    expect(response.status).toBe(429)
    expect(fixture.reads).toEqual([])
    expect(fixture.calls).toEqual([])
  })

  it('rejects non-string model input', async () => {
    const { response } = await request({ model: 'akasha-sonnet' })
    expect(response.status).toBe(400)
    expect(fixture.writes).toEqual([])
    expect(fixture.calls).toEqual([])
  })
})
