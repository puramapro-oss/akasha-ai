import { Socket } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn(), rateLimit: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('@/lib/rate-limit', () => ({ ratelimitContact: { limit: doubles.rateLimit } }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
const ID = '11111111-1111-4111-8111-111111111111'
const BODY = { name: 'Mina', email: 'mina@example.invalid', subject: 'Synthetic contact', message: 'No real message.' }
let dbMode: 'success' | 'error' | 'transport' | 'no-id' | 'wrong-id'
let alteration: Record<string, unknown>
let readAlteration: Record<string, unknown>
let readMode: 'success' | 'error' | 'transport' | 'empty'
let databaseDelay: number
let reads: URL[]
let writes: { input: unknown; options?: RequestInit; url: URL }[]
const request = (body: unknown = BODY) => new NextRequest('https://app.synthetic.invalid/api/contact', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const run = async () => (await import('./route')).POST(request())
beforeEach(() => {
  vi.clearAllMocks(); dbMode = 'success'; writes = []; alteration = {}; reads = []; readAlteration = {}; readMode = 'success'; databaseDelay = 0
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_only')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network forbidden') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  doubles.rateLimit.mockResolvedValue({ success: true })
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-email-id' }, error: null })
  const transport: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    if (url.origin !== 'https://supabase.synthetic.invalid' || url.pathname !== '/rest/v1/contact_messages') {
      throw new Error('Unexpected database operation')
    }
    if (databaseDelay) await new Promise(resolve => setTimeout(resolve, databaseDelay))
    if (options?.method === 'GET') {
      reads.push(url)
      if (readMode === 'transport') throw new Error('Synthetic read transport loss')
      return Response.json(readMode === 'error' ? { code: '42501', message: 'Synthetic read rejection' }
        : readMode === 'empty' ? null : { id: ID, ...BODY, ...readAlteration }, { status: readMode === 'error' ? 403 : 200 })
    }
    if (options?.method !== 'POST') throw new Error('Unexpected database method')
    writes.push({ input: JSON.parse(String(options.body)), options, url })
    if (dbMode === 'transport') throw new Error('synthetic response lost after potential commit')
    return Response.json(dbMode === 'error' ? { code: '42501', message: 'Synthetic DB rejection' }
      : dbMode === 'no-id' ? null : { id: dbMode === 'wrong-id' ? 'invalid-id' : ID, ...JSON.parse(String(options.body)), ...alteration }, { status: dbMode === 'error' ? 403 : 201 })
  }
  doubles.client.mockReturnValue(createClient('https://supabase.synthetic.invalid', 'synthetic-key', {
    db: { schema: 'akasha_ai' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }))
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled(); expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() }
})

describe('contact success means durable registration, separate from email acceptance', () => {
  it.each(['error', 'transport', 'no-id', 'wrong-id'] as const)('never sends email after an unconfirmed database insert: %s', async mode => {
    dbMode = mode
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, stored: 'unconfirmed' })
    expect(doubles.send).not.toHaveBeenCalled()
    expect(writes).toHaveLength(1)
  })

  it.each([
    { name: 'Different name' }, { email: 'another@example.invalid' },
    { subject: 'Different subject' }, { message: 'Different body' }, { message: null },
  ])('never sends or acknowledges rewritten persisted content: %j', async change => {
    alteration = change
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, stored: 'unconfirmed' })
    expect(doubles.send).not.toHaveBeenCalled()
    expect(writes).toHaveLength(1)
  })

  it.each(['error', 'transport', 'empty'] as const)('does not send after an unconfirmed post-insert read: %s', async mode => {
    readMode = mode
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ stored: 'unconfirmed' })
    expect(writes).toHaveLength(1)
    expect(doubles.send).not.toHaveBeenCalled()
  }, 15_000) // The installed client retries read-only transport errors with 1/2/4 s backoff.

  it.each([{ id: '22222222-2222-4222-8222-222222222222' }, { name: 'Changed name' },
    { email: 'changed@example.invalid' }, { subject: 'Changed subject' }, { message: 'Changed body' }])(
    'does not trust an insert receipt after persisted content changed: %j', async change => {
      readAlteration = change
      const response = await run()
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ stored: 'unconfirmed' })
      expect(doubles.send).not.toHaveBeenCalled()
    },
  )

  it('finishes the bounded database and parallel email waits inside the 45-second client window', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const started = Date.now()
    databaseDelay = 9_900
    doubles.send.mockImplementation(() => new Promise(() => undefined))
    const pending = run()
    await vi.advanceTimersByTimeAsync(39_801)
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, emails: { team: 'unconfirmed', confirmation: 'unconfirmed' } })
    expect(Date.now() - started).toBeLessThan(45_000)
    expect(writes).toHaveLength(1)
    expect(reads).toHaveLength(1)
    expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('returns the confirmed contact id and both independent email acceptance states', async () => {
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, stored: true, message_id: ID,
      emails: { team: 'accepted', confirmation: 'accepted' } })
    expect(writes).toHaveLength(1)
    expect(writes[0].input).toEqual(BODY)
    expect(reads).toHaveLength(1)
    expect(reads[0].searchParams.get('id')).toBe('eq.' + ID)
    expect(writes[0].url.searchParams.get('select')).toBe('id,name,email,subject,message')
    expect(new Headers(writes[0].options?.headers).get('prefer')).toContain('return=representation')
    expect(doubles.send).toHaveBeenCalledTimes(2)
    expect(doubles.send.mock.calls[1][0].html).not.toMatch(/24\s*h/)
  })

  it.each([
    ['resolved provider error', { data: null, error: { message: 'Synthetic provider rejection' } }],
    ['missing acceptance id', { data: {}, error: null }],
    ['blank acceptance id', { data: { id: ' ' }, error: null }],
    ['contradictory provider receipt', { data: { id: 'synthetic' }, error: { message: 'Synthetic error' } }],
  ])('preserves message registration after %s', async (_label, result) => {
    doubles.send.mockResolvedValueOnce(result)
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, stored: true, message_id: ID,
      emails: { team: 'unconfirmed', confirmation: 'accepted' } })
    expect(writes).toHaveLength(1)
    expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('does not report a lost contact or skip confirmation after a team-email transport exception', async () => {
    doubles.send.mockRejectedValueOnce(new Error('Synthetic provider transport loss'))
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, message_id: ID,
      emails: { team: 'unconfirmed', confirmation: 'accepted' } })
    expect(doubles.send).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(1)
  })

  it('reports a user-confirmation failure independently of the team notification', async () => {
    doubles.send.mockResolvedValueOnce({ data: { id: 'team-id' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Synthetic user-confirmation rejection' } })
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true,
      emails: { team: 'accepted', confirmation: 'unconfirmed' } })
  })

  it('bounds provider waiting without losing or replaying the registered contact', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let accept!: (value: unknown) => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    doubles.send.mockImplementationOnce(() => { entered(); return new Promise(resolve => { accept = resolve }) })
    const pending = run()
    await started; await vi.advanceTimersByTimeAsync(20_001)
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true,
      emails: { team: 'unconfirmed', confirmation: 'accepted' } })
    accept({ data: { id: 'late-provider-id' }, error: null }); await Promise.resolve()
    expect(doubles.send).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(1)
  })

  it('fails closed if admission rate-limit storage is unavailable', async () => {
    doubles.rateLimit.mockRejectedValueOnce(new Error('Synthetic rate limit unavailable'))
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ stored: false })
    expect(writes).toHaveLength(0); expect(doubles.send).not.toHaveBeenCalled()
  })

  it('rejects the installed rate limiter timeout fail-open result before any effect', async () => {
    doubles.rateLimit.mockResolvedValueOnce({ success: true, reason: 'timeout' })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ stored: false })
    expect(writes).toHaveLength(0); expect(doubles.send).not.toHaveBeenCalled()
  })

  it('bounds rate-limit waiting before persistence and ignores a late admission result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let accept!: (value: unknown) => void
    let begin!: () => void
    const entered = new Promise<void>(resolve => { begin = resolve })
    doubles.rateLimit.mockImplementationOnce(() => { begin(); return new Promise(resolve => { accept = resolve }) })
    const pending = run()
    await entered; await vi.advanceTimersByTimeAsync(2_001)
    const response = await pending
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ stored: false })
    accept({ success: true }); await Promise.resolve()
    expect(writes).toHaveLength(0); expect(reads).toHaveLength(0); expect(doubles.send).not.toHaveBeenCalled()
  })
})
