import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  construct: vi.fn(),
  send: vi.fn(),
  serviceClient: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: doubles.send }
    constructor(key?: string) {
      doubles.construct(key)
      if (!key) throw new Error('Missing API key')
    }
  },
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.serviceClient }))
vi.mock('@/lib/rate-limit', () => ({ ratelimitContact: { limit: doubles.rateLimit } }))

const contactBody = {
  name: 'Test User',
  email: 'user@example.invalid',
  subject: 'Synthetic test',
  message: 'No real message is sent.',
}
const contactRequest = (body: unknown = contactBody) => new NextRequest('http://localhost/api/contact', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const cronRequest = (authorized = true) => new NextRequest('http://localhost/api/cron/emails', {
  headers: authorized ? { authorization: 'Bearer unit-test-cron-secret' } : {},
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', undefined)
  vi.stubEnv('CRON_SECRET', 'unit-test-cron-secret')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network disabled in email readiness tests') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  doubles.rateLimit.mockResolvedValue({ success: true })
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-email' }, error: null })
  doubles.serviceClient.mockImplementation(() => { throw new Error('Unexpected database access') })
})

afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

describe('email routes without provider configuration', () => {
  it('imports contact without constructing a provider client', async () => {
    await expect(import('@/app/api/contact/route')).resolves.toBeDefined()
    expect(doubles.construct).not.toHaveBeenCalled()
  })

  it('imports the email cron without constructing a provider client', async () => {
    await expect(import('@/app/api/cron/emails/route')).resolves.toBeDefined()
    expect(doubles.construct).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   '])('refuses an authenticated cron with missing/blank key %j before effects', async key => {
    vi.stubEnv('RESEND_API_KEY', key)
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(cronRequest())).status).toBe(503)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   '])('refuses contact with missing/blank key %j before effects', async key => {
    vi.stubEnv('RESEND_API_KEY', key)
    const { POST } = await import('@/app/api/contact/route')
    expect((await POST(contactRequest())).status).toBe(503)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.rateLimit).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
    expect(doubles.send).not.toHaveBeenCalled()
  })
})

describe('email routes preserve admission and configured behavior', () => {
  beforeEach(() => vi.stubEnv('RESEND_API_KEY', 're_unit_test_only'))

  it('authenticates the cron before constructing a client', async () => {
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(cronRequest(false))).status).toBe(401)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
  })

  it('refuses an unconfigured cron secret before provider or database access', async () => {
    vi.stubEnv('CRON_SECRET', undefined)
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(cronRequest())).status).toBe(503)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
  })

  it('preserves contact rate-limit rejection before provider construction', async () => {
    doubles.rateLimit.mockResolvedValue({ success: false })
    const { POST } = await import('@/app/api/contact/route')
    expect((await POST(contactRequest())).status).toBe(429)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
  })

  it('rejects invalid contact data before provider construction or database writes', async () => {
    const { POST } = await import('@/app/api/contact/route')
    expect((await POST(contactRequest({}))).status).toBe(400)
    expect(doubles.construct).not.toHaveBeenCalled()
    expect(doubles.serviceClient).not.toHaveBeenCalled()
  })

  it('keeps the configured contact persistence and two synthetic sends', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    doubles.serviceClient.mockReturnValue({ from })
    const { POST } = await import('@/app/api/contact/route')
    expect(doubles.construct).not.toHaveBeenCalled()
    const response = await POST(contactRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(doubles.construct).toHaveBeenCalledExactlyOnceWith('re_unit_test_only')
    expect(from).toHaveBeenCalledWith('contact_messages')
    expect(insert).toHaveBeenCalledWith(contactBody)
    expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('keeps an authenticated configured cron with no eligible recipients', async () => {
    const lt = vi.fn().mockResolvedValue({ data: [] })
    const from = vi.fn().mockReturnValue({ select: () => ({ gte: () => ({ lt }) }) })
    doubles.serviceClient.mockReturnValue({ from })
    const { GET } = await import('@/app/api/cron/emails/route')
    expect(doubles.construct).not.toHaveBeenCalled()
    const response = await GET(cronRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', sent: 0 })
    expect(doubles.construct).toHaveBeenCalledExactlyOnceWith('re_unit_test_only')
    expect(from).toHaveBeenCalledTimes(7)
    expect(doubles.send).not.toHaveBeenCalled()
  })
})
