import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installScheduledRecipients, scheduledUser } from './email-cron.test-support'

const doubles = vi.hoisted(() => ({ send: vi.fn(), serviceClient: vi.fn(), delay: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.serviceClient }))
vi.mock('node:timers/promises', () => ({ setTimeout: doubles.delay }))
const request = () => new NextRequest('http://localhost/api/cron/emails', { headers: { authorization: 'Bearer synthetic-cron-secret' } })
const recipients = (count: number) => Array.from({ length: count }, (_, index) => scheduledUser(`user-${String(index).padStart(4, '0')}`, '2026-11-22T10:00:00.123456+00:00'))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
  vi.stubEnv('RESEND_API_KEY', 're_unit_test_only')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T12:00:00.000Z'))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network disabled in email tests') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-email' }, error: null })
  doubles.delay.mockResolvedValue(undefined)
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

describe('scheduled email cohorts advance without silent truncation', () => {
  it('encodes the ordered anti-join and cursor through the real Supabase client without network', async () => {
    const user = scheduledUser('synthetic-user', '2026-11-22T10:00:00.123456+00:00')
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify([user]), { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const client = createClient('https://email-fixture.invalid', 'synthetic-public-key', {
      db: { schema: 'akasha_ai' }, global: { fetch: transport },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { emailCohortPages, EmailRunBudget } = await import('@/lib/email-sequence-recipients')
    const pages = []
    for await (const page of emailCohortPages(client, 'welcome', new Date('2026-11-22T00:00:00Z'), new Date('2026-11-23T00:00:00Z'), new EmailRunBudget())) pages.push(page)
    expect(pages).toEqual([[user]])
    expect(transport).toHaveBeenCalledTimes(2)
    const first = new URL(String(transport.mock.calls[0][0]))
    const second = new URL(String(transport.mock.calls[1][0]))
    expect(first.searchParams.get('select')).toBe('id,email,display_name,created_at,email_sequences()')
    expect(first.searchParams.get('email_sequences.email_type')).toBe('eq.welcome')
    expect(first.searchParams.get('email_sequences')).toBe('is.null')
    expect(first.searchParams.get('order')).toBe('created_at.asc,id.asc')
    expect(first.searchParams.get('limit')).toBe('100')
    expect(first.searchParams.getAll('created_at')).toEqual(['gte.2026-11-22T00:00:00.000Z', 'lt.2026-11-23T00:00:00.000Z'])
    expect(second.searchParams.get('or')).toBe('(created_at.gt."2026-11-22T10:00:00.123456+00:00",and(created_at.eq."2026-11-22T10:00:00.123456+00:00",id.gt."synthetic-user"))')
    expect(second.searchParams.has('offset')).toBe(false)
    expect(new Headers(transport.mock.calls[0][1]?.headers).get('Accept-Profile')).toBe('akasha_ai')
  })

  it('reaches an opted-in recipient after the first 100 rows with stable timestamp/id ordering', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(101).reverse())
    db.preference.mockImplementation(userId => ({ data: { user_id: userId, types: { newsletter: true, product_updates: userId === 'user-0100' } }, error: null }))
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sent: 1, skipped: 100, failed: 0, deferred: false })
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(doubles.send.mock.calls[0][0].to).toBe('user-0100@example.invalid')
    // The durable claim is the only final consent read, after pacing.
    expect(db.preference).toHaveBeenCalledTimes(101)
    expect(db.preference).toHaveBeenLastCalledWith('user-0100')
    const pages = db.profileQueries.filter(query => query.filters['email_sequences.email_type'] === 'welcome')
    expect(pages).toHaveLength(3)
    expect(pages[0]).toMatchObject({ limit: 100, filters: { email_sequences: null }, orders: [
      { field: 'created_at', ascending: true }, { field: 'id', ascending: true },
    ] })
    expect(pages[0].selection).toContain('email_sequences()')
    expect(pages[1].cursor).toBe('created_at.gt."2026-11-22T10:00:00.123456+00:00",and(created_at.eq."2026-11-22T10:00:00.123456+00:00",id.gt."user-0099")')
  })

  it('continues after a short server-capped page without rounding away microseconds', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, [
      scheduledUser('second', '2026-11-22T10:00:00.123002Z'), scheduledUser('first', '2026-11-22T10:00:00.123001Z'),
    ])
    const read = db.profiles.getMockImplementation()!
    db.profiles.mockImplementation((...args) => {
      const result = read(...args)
      return { ...result, data: Array.isArray(result.data) ? result.data.slice(0, 1) : result.data }
    })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sent: 2, failed: 0 })
    expect(doubles.send.mock.calls.map(call => call[0].to)).toEqual(['first@example.invalid', 'second@example.invalid'])
    expect(db.profileQueries[1].cursor).toContain('2026-11-22T10:00:00.123001Z')
    expect(doubles.delay).toHaveBeenCalledExactlyOnceWith(550)
  })

  it('reports a refused second page and still processes another independent signup day', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, [...recipients(101), scheduledUser('yesterday', '2026-11-21T10:00:00.000Z')])
    db.preference.mockImplementation(userId => ({ data: { user_id: userId, types: { newsletter: true, product_updates: userId === 'yesterday' } }, error: null }))
    const read = db.profiles.getMockImplementation()!
    db.profiles.mockImplementation((...args) => args[2].cursor && args[2].filters['email_sequences.email_type'] === 'welcome'
      ? { data: null, error: { message: 'Second page denied' } } : read(...args))
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ status: 'partial', sent: 1, failed: 1, skipped: 100 })
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(doubles.send.mock.calls[0][0].to).toBe('yesterday@example.invalid')
  })

  it('rejects a page that does not advance instead of looping or resending', async () => {
    const user = scheduledUser()
    const db = installScheduledRecipients(doubles.serviceClient, [user])
    db.profiles.mockReturnValueOnce({ data: [user], error: null }).mockReturnValueOnce({ data: [user], error: null })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 1, failed: 1 })
    expect(doubles.send).toHaveBeenCalledOnce()
  })
})

describe('scheduled emails stay within a bounded provider workload', () => {
  it('defers after 75 attempts and resumes from unreceipted users on the same UTC day', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(76))
    const { GET } = await import('@/app/api/cron/emails/route')
    const first = await GET(request())
    expect(first.status).toBe(503)
    expect(await first.json()).toMatchObject({ status: 'partial', sent: 75, failed: 0, deferred: true })
    expect(doubles.send).toHaveBeenCalledTimes(75)
    const second = await GET(request())
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ sent: 1, deferred: false })
    expect(doubles.send).toHaveBeenCalledTimes(76)
    expect(db.claim).toHaveBeenCalledTimes(76)
    expect(db.deliveries.size).toBe(76)
    expect(new Set(doubles.send.mock.calls.map(call => call[1].idempotencyKey)).size).toBe(76)
  })

  it('finishes recording the current send then defers when the time budget is exhausted', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(2))
    doubles.send.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-11-22T12:00:46.000Z'))
      return { data: { id: 'synthetic-email' }, error: null }
    })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0, deferred: true })
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(db.receipts.size).toBe(1)
  })

  it('never reserves a send when the time budget expires during cohort loading', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(1))
    const read = db.profiles.getMockImplementation()!
    db.profiles.mockImplementationOnce((...args) => {
      vi.setSystemTime(new Date('2026-11-22T12:00:46.000Z'))
      return read(...args)
    })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ sent: 0, failed: 0, deferred: true })
    expect(db.claim).not.toHaveBeenCalled()
    expect(db.deliveries.size).toBe(0)
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it('checks pacing before reservation so a final wait cannot leave an unused claim', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(2))
    const read = db.profiles.getMockImplementation()!
    db.profiles.mockImplementationOnce((...args) => {
      vi.setSystemTime(new Date('2026-11-22T12:00:44.800Z'))
      return read(...args)
    })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0, deferred: true })
    expect(db.claim).toHaveBeenCalledOnce()
    expect(db.deliveries.size).toBe(1)
    expect([...db.deliveries.values()][0].state).toBe('sent')
    expect(doubles.send).toHaveBeenCalledOnce()
  })

  it('finishes a claim admitted before the deadline even when its receipt arrives later', async () => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(2))
    const read = db.profiles.getMockImplementation()!, claim = db.claim.getMockImplementation()!
    db.profiles.mockImplementationOnce((...args) => {
      vi.setSystemTime(new Date('2026-11-22T12:00:44.000Z'))
      return read(...args)
    })
    db.claim.mockImplementationOnce(async args => {
      vi.setSystemTime(new Date('2026-11-22T12:00:54.000Z'))
      return claim(args)
    })
    const { GET, maxDuration } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0, deferred: true })
    expect(db.claim).toHaveBeenCalledOnce()
    expect(db.complete).toHaveBeenCalledOnce()
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(maxDuration).toBeGreaterThan(45 + 10 + 20 + 10 + 10)
  })

  it.each(['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded'])('stops remaining sends on provider capacity error %s', async name => {
    const db = installScheduledRecipients(doubles.serviceClient, recipients(2))
    doubles.send.mockResolvedValue({ data: null, error: { name, statusCode: 429, message: 'Synthetic capacity limit' } })
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ sent: 0, failed: 0, reconciliation_required: 1, deferred: true })
    expect(doubles.send).toHaveBeenCalledOnce()
    expect(db.complete).not.toHaveBeenCalled()
    expect([...db.deliveries.values()]).toEqual([expect.objectContaining({ state: 'reconciliation_required' })])
    doubles.send.mockResolvedValue({ data: { id: 'later-synthetic-email' }, error: null })
    await GET(request())
    expect(doubles.send).toHaveBeenCalledTimes(2)
    expect(doubles.send.mock.calls[1][0].to).toBe('user-0001@example.invalid')
  })
})
