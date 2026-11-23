import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installScheduledRecipients, scheduledUser } from './email-cron.test-support'

const doubles = vi.hoisted(() => ({ send: vi.fn(), client: vi.fn(), wait: vi.fn() }))
vi.mock('node:timers/promises', () => ({ setTimeout: doubles.wait }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

async function run() {
  const { GET } = await import('@/app/api/cron/emails/route')
  return GET(new NextRequest('https://example.invalid/api/cron/emails', {
    headers: { authorization: 'Bearer synthetic-consent-cron' },
  }))
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
  vi.stubEnv('CRON_SECRET', 'synthetic-consent-cron'); vi.stubEnv('RESEND_API_KEY', 're_synthetic')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network disabled') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Sockets disabled') })
  doubles.wait.mockResolvedValue(undefined)
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-accepted' }, error: null })
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers()
  }
})

describe('the final consent is read after the provider pacing delay', () => {
  it.each([
    { name: 'opt-out', row: { user_id: SECOND, types: { newsletter: true, product_updates: false } }, error: null, status: 200 },
    { name: 'pause', row: { user_id: SECOND, types: { newsletter: true }, paused_until: '2026-11-23T00:00:00Z' }, error: null, status: 200 },
    { name: 'read failure', row: null, error: { message: 'Synthetic unavailable preferences' }, status: 503 },
    { name: 'foreign owner', row: { user_id: FIRST, types: { newsletter: true } }, error: null, status: 503 },
  ])('does not send after a $name during the wait', async ({ row, error, status }) => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(FIRST), scheduledUser(SECOND)])
    let waited = false
    doubles.wait.mockImplementation(async () => { waited = true })
    db.preference.mockImplementation(userId => userId === SECOND && waited
      ? { data: row, error } : { data: { user_id: userId, types: { newsletter: true } }, error: null })
    const response = await run()
    expect(doubles.wait).toHaveBeenCalledOnce()
    expect(response.status).toBe(status)
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(doubles.send.mock.calls[0][0].to).toBe(`${FIRST}@example.invalid`)
    expect([...db.receipts]).toEqual([`${FIRST}/welcome`])
    expect(db.claim).toHaveBeenCalledTimes(2)
    expect(db.claim.mock.invocationCallOrder[1]).toBeGreaterThan(doubles.wait.mock.invocationCallOrder[0])
    expect(db.deliveries.size).toBe(1)
    expect(db.complete).toHaveBeenCalledOnce()
    expect(db.rpc.mock.calls.some(([name]) => name === 'record_email_sequence_delivery')).toBe(false)
  })
})

describe('scheduled messages only describe configured offers and documented features', () => {
  it('does not advertise an unconfigured coupon or expiry', async () => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(FIRST, '2026-11-08T10:00:00Z')])
    db.preference.mockReturnValue({ data: { user_id: FIRST, types: { newsletter: true } }, error: null })
    expect((await run()).status).toBe(200)
    const email = doubles.send.mock.calls[0][0]
    expect(email.subject + email.html).not.toMatch(/EMAIL20|-20%|48h/)
    expect(email.html).toContain('/pricing')
    expect(email.html).toContain('/dashboard/settings')
  })

  it('does not present invented quotations as customer testimonials', async () => {
    const db = installScheduledRecipients(doubles.client, [scheduledUser(FIRST, '2026-11-01T10:00:00Z')])
    db.preference.mockReturnValue({ data: { user_id: FIRST, types: { newsletter: true } }, error: null })
    expect((await run()).status).toBe(200)
    const email = doubles.send.mock.calls[0][0]
    expect(email.html).not.toContain('<blockquote')
    expect(email.html).not.toContain('50 EUR')
    expect(email.html).toContain('brouillon')
  })
})
