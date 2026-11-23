import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emailFixture, NOW } from '../../../tests/email-sequences/fixture'

const doubles = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => undefined) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret'); vi.stubEnv('RESEND_API_KEY', 're_synthetic_only')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected real fetch') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
})
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled(); expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() }
})

it('resumes the ordered cohort across bounded runs without revisiting receipts', async () => {
  const fixture = emailFixture()
  fixture.state.profiles = Array.from({ length: 101 }, (_, index) => ({
    id: '00000000-0000-4000-8000-' + (index + 1).toString().padStart(12, '0'),
    email: `recipient${index}@example.invalid`, display_name: 'Synthetic', created_at: '2026-11-22T02:00:00.000Z',
  }))
  doubles.client.mockReturnValue(fixture.client)
  let nextId = 0
  doubles.send.mockImplementation(async () => ({ data: { id: `synthetic-${++nextId}` }, error: null }))
  const { GET } = await import('@/app/api/cron/emails/route')
  const request = () => new NextRequest('https://app.synthetic.invalid/api/cron/emails', {
    headers: { authorization: 'Bearer synthetic-cron-secret' },
  })
  const first = await GET(request())
  expect(first.status).toBe(503)
  expect(await first.json()).toMatchObject({ sent: 75, failed: 0, reconciliation_required: 0, deferred: true })
  expect(fixture.state.deliveries.size).toBe(75)
  const second = await GET(request())
  expect(second.status).toBe(200)
  expect(await second.json()).toMatchObject({ sent: 26, failed: 0, reconciliation_required: 0, deferred: false })
  expect(doubles.send).toHaveBeenCalledTimes(101)
  expect(fixture.state.logs).toBe(101)
  const pages = fixture.state.queries.filter(url => url.pathname.endsWith('/profiles'))
  expect(pages).toHaveLength(9)
  expect(pages[0].searchParams.get('order')).toBe('created_at.asc,id.asc')
  expect(pages[0].searchParams.get('limit')).toBe('100')
  expect(pages[2].searchParams.get('or')).toContain('id.gt."' + fixture.state.profiles[100].id + '"')
  expect(new Set(doubles.send.mock.calls.map(call => call[0].to)).size).toBe(101)
})
