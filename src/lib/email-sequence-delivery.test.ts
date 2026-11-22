import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installScheduledRecipients, scheduledUser } from './email-cron.test-support'

const doubles = vi.hoisted(() => ({ send: vi.fn(), client: vi.fn() }))
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => undefined) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
const USER = '00000000-0000-4000-8000-000000000001'
const request = () => new NextRequest('http://localhost/api/cron/emails', {
  headers: { authorization: 'Bearer synthetic-cron-key' },
})

function install(options: {
  types?: unknown; pausedUntil?: string | null; preferenceError?: boolean;
  profileError?: boolean; historyError?: boolean; recorded?: boolean; recordError?: boolean;
} = {}) {
  const users = [0, 1, 3, 7, 14, 21, 30].map((offset, index) => scheduledUser(
    '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    new Date(Date.UTC(2026, 10, 22 - offset, 10)).toISOString(),
  ))
  const db = installScheduledRecipients(doubles.client, users)
  db.preference.mockImplementation(userId => ({ data: { user_id: userId,
    types: options.types ?? { product_updates: true, newsletter: true, weekly_digest: true },
    paused_until: options.pausedUntil ?? null },
    error: options.preferenceError ? { message: 'Synthetic preference failure' } : null,
  }))
  if (options.profileError) db.profiles.mockReturnValue({ data: null, error: { message: 'Synthetic profile failure' } })
  if (options.historyError) db.receipt.mockReturnValue({ data: null, count: null, error: { message: 'Synthetic receipt read failure' } })
  if (options.recordError) db.record.mockResolvedValue({ data: null, error: { message: 'Synthetic record failure' } })
  else if (options.recorded === false) db.record.mockImplementation(async (_name, args) => {
    db.receipts.add(`${args.p_user_id}/${args.p_email_type}`)
    return { data: false, error: null }
  })
  return db
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network disabled in email tests') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-key')
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_key')
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-email' }, error: null })
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  }
})

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
  it.each([{ preferenceError: true }, { historyError: true }])('fails closed on a database read failure %j', async options => {
    install(options)
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(503)
    expect(doubles.send).not.toHaveBeenCalled()
  })
  it('reports a recipient query failure instead of reporting an empty success', async () => {
    install({ profileError: true })
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(503)
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
    expect(doubles.send).toHaveBeenCalledTimes(7)
    expect(record).toHaveBeenCalledTimes(7)
  })
  it('includes the final fractional second of the UTC signup day', async () => {
    const db = install()
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(request())).status).toBe(200)
    const ranges = db.profileQueries.filter(query => !query.cursor).map(query => query.end)
    expect(ranges[0]).toBe('2026-11-23T00:00:00.000Z')
    expect(ranges[1]).toBe('2026-11-22T00:00:00.000Z')
  })

  it.each([true, false, null, 'true'])('never counts an RPC result %j without its exact persisted receipt', async result => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(USER)])
    db.record.mockResolvedValue({ data: result, error: null })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1 })
    expect(db.receipts.size).toBe(0)
    expect(db.record).toHaveBeenCalledOnce()
  })

  it.each([
    { data: { user_id: 'another-user', email_type: 'welcome' }, count: 1, error: null },
    { data: { user_id: USER, email_type: 'tip_day1' }, count: 1, error: null },
    { data: null, count: null, error: { message: 'Receipt read denied after RPC' } },
  ])('checks the persisted actor and sequence after an acknowledged RPC: %j', async result => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(USER)])
    db.receipt.mockReturnValueOnce({ data: null, count: 0, error: null }).mockReturnValue(result)
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1 })
    expect(doubles.send).toHaveBeenCalledOnce()
  })

  it('reuses the canonical provider key after the journal RPC fails', async () => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(USER)])
    db.record.mockResolvedValueOnce({ data: null, error: { message: 'Journal unavailable' } })
    const { GET } = await import('@/app/api/cron/emails/route')
    const first = await GET(request())
    expect(first.status).toBe(503)
    expect(await first.json()).toMatchObject({ sent: 0, failed: 1 })
    const second = await GET(request())
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ sent: 1, failed: 0 })
    expect(doubles.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'akasha-email/welcome/' + USER })
    expect(doubles.send.mock.calls[1]).toEqual(doubles.send.mock.calls[0])
  })

  it('keeps one RPC receipt and one counted sequence across overlapping executions', async () => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(USER)])
    let release!: () => void
    const bothSending = new Promise<void>(resolve => { release = resolve })
    doubles.send.mockImplementation(async () => {
      if (doubles.send.mock.calls.length === 2) release()
      await bothSending
      return { data: { id: 'same-provider-email' }, error: null }
    })
    const { GET } = await import('@/app/api/cron/emails/route')
    const responses = await Promise.all([GET(request()), GET(request())])
    const outcomes = await Promise.all(responses.map(response => response.json()))
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect(outcomes.reduce((total, result) => total + result.sent, 0)).toBe(1)
    expect(db.receipts.size).toBe(1)
    expect(doubles.send.mock.calls[1]).toEqual(doubles.send.mock.calls[0])
  })
})
