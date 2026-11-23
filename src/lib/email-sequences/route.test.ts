import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailFixture, NOW, USER } from '../../../tests/email-sequences/fixture'

const doubles = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => undefined) }))

let fixture: ReturnType<typeof emailFixture>
const request = () => new NextRequest('https://app.synthetic.invalid/api/cron/emails', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
})
const run = async () => (await import('@/app/api/cron/emails/route')).GET(request())
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_only')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No real requests in this suite') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  fixture = emailFixture()
  doubles.client.mockReturnValue(fixture.client)
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-provider-id' }, error: null })
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers()
  }
})

describe('scheduled emails respect stored choices and actual receipts', () => {
  it.each([
    ['missing row', null], ['empty choices', { types: {} }], ['explicit refusal', { types: { newsletter: false } }],
    ['string boolean', { types: { newsletter: 'true' } }], ['numeric boolean', { types: { newsletter: 1 } }],
    ['different category', { types: { product_updates: true, weekly_digest: true } }],
    ['array', { types: [] }],
  ])('does not send with %s', async (_label, preferences) => {
    fixture.state.preferences = preferences
    const result = await run()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ status: 'ok', sent: 0 })
    expect(doubles.send).not.toHaveBeenCalled()
    expect(fixture.state.logs).toBe(0)
  })

  it('respects paused_until even with an explicit subscription', async () => {
    fixture.state.preferences = { types: { newsletter: true }, paused_until: '2026-11-23T00:00:00Z' }
    const result = await run()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ sent: 0 })
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it('sends once with a persisted reservation and provider idempotency key', async () => {
    const result = await run()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ status: 'ok', sent: 1 })
    expect(doubles.send).toHaveBeenCalledTimes(1)
    expect(doubles.send.mock.calls[0][1]).toEqual({ idempotencyKey: `akasha-email/welcome/${USER}` })
    expect(fixture.state.logs).toBe(1)
    expect(fixture.state.deliveries.get(`${USER}/welcome`)).toMatchObject({ state: 'sent', provider_email_id: 'synthetic-provider-id' })
    expect((await run()).status).toBe(200)
    expect(doubles.send).toHaveBeenCalledTimes(1)
  })

  it.each(['profiles', 'admission'] as const)('fails closed on %s database errors', async kind => {
    if (kind === 'profiles') fixture.state.failProfiles = true
    else fixture.state.failAdmission = true
    const result = await run()
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ status: 'partial', sent: 0 })
    expect(doubles.send).not.toHaveBeenCalled()
    expect(fixture.state.logs).toBe(0)
  })

  it('rejects a mismatched reservation receipt before sending', async () => {
    fixture.state.invalidAdmission = true
    expect((await run()).status).toBe(503)
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it.each([
    ['provider error', { data: null, error: { message: 'synthetic rejection' } }],
    ['error plus id', { data: { id: 'synthetic-provider-id' }, error: { message: 'synthetic conflict' } }],
    ['missing id', { data: {}, error: null }],
    ['blank id', { data: { id: '   ' }, error: null }],
  ])('does not count %s as a sent message and does not automatically replay', async (_label, value) => {
    doubles.send.mockResolvedValueOnce(value)
    const result = await run()
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ status: 'partial', sent: 0 })
    expect(fixture.state.logs).toBe(0)
    expect((await run()).status).toBe(503)
    expect(doubles.send).toHaveBeenCalledTimes(1)
  })

  it('retains an ambiguous provider attempt after a transport exception', async () => {
    doubles.send.mockRejectedValueOnce(new Error('synthetic response lost'))
    expect((await run()).status).toBe(503)
    expect(fixture.state.logs).toBe(0)
    expect((await run()).status).toBe(503)
    expect(doubles.send).toHaveBeenCalledTimes(1)
  })

  it.each(['failCompletion', 'invalidCompletion', 'loseCompletion'] as const)(
    'reports an unconfirmed send when %s instead of replaying it', async problem => {
      fixture.state[problem] = true
      const result = await run()
      expect(result.status).toBe(503)
      expect(await result.json()).toMatchObject({ sent: 0, status: 'partial' })
      fixture.state[problem] = false
      await run()
      expect(doubles.send).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps the original reservation even when reconciliation recording also fails', async () => {
    doubles.send.mockRejectedValueOnce(new Error('synthetic provider timeout'))
    fixture.state.failReconciliation = true
    expect((await run()).status).toBe(503)
    expect((await run()).status).toBe(503)
    expect(doubles.send).toHaveBeenCalledTimes(1)
  })

  it.each([true, false, null, 'true', { status: 'sent' }])(
    'never counts a completion acknowledgement %j without the full durable identity', async value => {
      fixture.state.overrideCompletion = true
      fixture.state.completionReceipt = value
      const result = await run()
      expect(result.status).toBe(503)
      expect(await result.json()).toMatchObject({ sent: 0, reconciliation_required: 1 })
      await run()
      expect(doubles.send).toHaveBeenCalledTimes(1)
    },
  )

  it('excludes an old send-log row without claiming a new provider confirmation', async () => {
    fixture.state.legacy = true
    const result = await run()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ sent: 0 })
    expect(doubles.send).not.toHaveBeenCalled()
    expect(fixture.state.rpc).toHaveLength(0)
  })

  it('admits only one of two overlapping cron attempts', async () => {
    const results = await Promise.all([run(), run()])
    expect(doubles.send).toHaveBeenCalledTimes(1)
    expect(fixture.state.logs).toBe(1)
    expect((await Promise.all(results.map(result => result.json()))).reduce((n, r) => n + r.sent, 0)).toBe(1)
  })

  it('includes the final fractional second of the UTC signup day', async () => {
    fixture.state.profiles[0].created_at = '2026-11-22T23:59:59.500Z'
    const result = await run()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ sent: 1 })
    const range = fixture.state.queries.find(url => url.pathname.endsWith('/profiles'))!.searchParams.getAll('created_at')
    expect(range).toEqual(['gte.2026-11-22T00:00:00.000Z', 'lt.2026-11-23T00:00:00.000Z'])
  })
})
