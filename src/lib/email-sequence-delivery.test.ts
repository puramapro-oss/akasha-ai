import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ send: vi.fn(), client: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
const USER = '00000000-0000-4000-8000-000000000001'
const request = () => new NextRequest('http://localhost/api/cron/emails', {
  headers: { authorization: 'Bearer synthetic-cron-key' },
})

function install(options: {
  types?: unknown; pausedUntil?: string | null; preferenceError?: boolean;
  profileError?: boolean; countError?: boolean; recorded?: boolean; recordError?: boolean;
} = {}) {
  const record = vi.fn().mockResolvedValue({ data: options.recorded ?? true,
    error: options.recordError ? { message: 'synthetic record failure' } : null })
  const ranges: string[] = []
  const lt = vi.fn((_column: string, end: string) => {
    ranges.push(end)
    return Promise.resolve({ data: options.profileError ? null : [
      { id: USER, email: 'recipient@example.invalid', display_name: 'Test' },
    ], error: options.profileError ? { message: 'synthetic profile failure' } : null })
  })
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return { select: () => ({ gte: () => ({ lt }) }) }
    if (table === 'notification_preferences') return { select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { user_id: USER,
        types: options.types ?? { product_updates: true, newsletter: true, weekly_digest: true },
        paused_until: options.pausedUntil ?? null },
      error: options.preferenceError ? { message: 'synthetic preference failure' } : null }),
    }) }) }
    if (table === 'email_sequences') return {
      select: () => ({ eq: () => ({ eq: async () => ({ count: options.countError ? null : 0,
        error: options.countError ? { message: 'synthetic count failure' } : null }) }) }),
      insert: record,
    }
    throw new Error('Unexpected table ' + table)
  })
  doubles.client.mockReturnValue({ from, rpc: record })
  return { record, ranges }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-key')
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_key')
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-email' }, error: null })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('scheduled delivery honors saved choices and confirmations', () => {
  it('does not send any sequence when all corresponding categories are disabled', async () => {
    install({ types: { product_updates: false, newsletter: false, weekly_digest: false } })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sent: 0 })
    expect(doubles.send).not.toHaveBeenCalled()
  })
  it('uses the same newsletter opt-in default as the settings screen', async () => {
    install({ types: {} })
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(200)
    expect(doubles.send).toHaveBeenCalledTimes(3)
  })
  it('honors a future pause', async () => {
    install({ pausedUntil: '2026-11-23T00:00:00Z' })
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(200)
    expect(doubles.send).not.toHaveBeenCalled()
  })
  it.each([{ preferenceError: true }, { countError: true }])('fails closed on a database read failure %j', async options => {
    install(options)
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(503)
    expect(doubles.send).not.toHaveBeenCalled()
  })
  it('reports a recipient query failure instead of reporting an empty success', async () => {
    install({ profileError: true })
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(500)
    expect(doubles.send).not.toHaveBeenCalled()
  })
  it.each([
    { data: null, error: { message: 'synthetic provider refusal' } },
    { data: null, error: null },
  ])('does not record or count a provider response without acceptance %j', async result => {
    const { record } = install()
    doubles.send.mockResolvedValue(result)
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 0, failed: 7 })
    expect(record).not.toHaveBeenCalled()
  })
  it('does not claim success when the accepted email cannot be recorded', async () => {
    install({ recordError: true })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 0, failed: 7 })
  })
  it('does not count the same recorded sequence twice', async () => {
    install({ recorded: false })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sent: 0 })
  })
  it('uses a stable provider key and records only provider-accepted sequences', async () => {
    const { record } = install()
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(200)
    const firstKey = doubles.send.mock.calls[0][1]?.idempotencyKey
    expect(firstKey).toBe('akasha-email/welcome/' + USER)
    expect(record).toHaveBeenCalledWith('record_email_sequence_delivery', { p_user_id: USER, p_email_type: 'welcome' })
    expect((await GET(request())).status).toBe(200)
    expect(doubles.send.mock.calls[7][1]?.idempotencyKey).toBe(firstKey)
  })
  it('includes the final fractional second of the UTC signup day', async () => {
    const { ranges } = install()
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(200)
    expect(ranges[0]).toBe('2026-11-23T00:00:00.000Z')
    expect(ranges[1]).toBe('2026-11-22T00:00:00.000Z')
  })
})
