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

describe('email content treats recipient input as text', () => {
  beforeEach(() => vi.stubEnv('RESEND_API_KEY', 're_unit_test_only'))

  function installCronRecipient(displayName: string) {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const lt = vi.fn().mockResolvedValue({
      data: [{ id: 'synthetic-user', email: 'recipient@example.invalid', display_name: displayName }],
    })
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return { select: () => ({ gte: () => ({ lt }) }) }
      if (table === 'email_sequences') return {
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }),
        insert,
      }
      throw new Error(`Unexpected table ${table}`)
    })
    doubles.serviceClient.mockReturnValue({ from })
    return { insert, from }
  }

  it('escapes every contact HTML field while preserving raw persistence, subjects and recipients', async () => {
    const body = {
      name: 'Mina <img src=x onerror="alert(1)"> & Co',
      email: "o'brien@example.invalid",
      subject: 'A & B <strong>"Sujet"</strong>',
      message: 'Premiere <script>alert(\'synthetic\')</script>\nSuite &lt;b&gt; & "citee"',
    }
    const insert = vi.fn().mockResolvedValue({ error: null })
    doubles.serviceClient.mockReturnValue({ from: () => ({ insert }) })
    const { POST } = await import('@/app/api/contact/route')
    expect((await POST(contactRequest(body))).status).toBe(200)
    expect(insert).toHaveBeenCalledExactlyOnceWith(body)
    expect(doubles.send).toHaveBeenCalledTimes(2)
    const notification = doubles.send.mock.calls[0][0]
    const confirmation = doubles.send.mock.calls[1][0]
    expect(notification.subject).toContain(body.subject)
    expect(notification.to).toBe('purama.pro@gmail.com')
    expect(confirmation.to).toBe(body.email)
    for (const email of [notification, confirmation]) {
      expect(email.html).toContain('Mina &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Co')
      expect(email.html).toContain('A &amp; B &lt;strong&gt;&quot;Sujet&quot;&lt;/strong&gt;')
      expect(email.html).not.toContain('<img')
      expect(email.html).not.toContain('<script')
    }
    expect(notification.html).toContain('o&#39;brien@example.invalid')
    expect(notification.html).toContain('Premiere &lt;script&gt;alert(&#39;synthetic&#39;)&lt;/script&gt;<br>Suite &amp;lt;b&amp;gt; &amp; &quot;citee&quot;')
  })

  it.each([
    [0, 'welcome'], [1, 'tip_day1'], [2, 'relaunch_day3'], [3, 'tips_day7'],
    [4, 'upgrade_day14'], [5, 'testimonial_day21'], [6, 'winback_day30'],
  ])('escapes profile markup in scheduled email %i (%s)', async (index) => {
    const { insert } = installCronRecipient('Mina <img src=x onerror="alert(1)"> & O\'Neil')
    const { GET } = await import('@/app/api/cron/emails/route')
    const response = await GET(cronRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', sent: 7 })
    expect(doubles.send).toHaveBeenCalledTimes(7)
    expect(insert).toHaveBeenCalledTimes(7)
    const email = doubles.send.mock.calls[Number(index)][0]
    expect(email.to).toBe('recipient@example.invalid')
    expect(email.html).toContain('Mina &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; O&#39;Neil')
    expect(email.html).not.toContain('<img')
  })

  it('describes the intended commission allocation without promising an active contest or available funds', async () => {
    installCronRecipient('Mina')
    const { GET } = await import('@/app/api/cron/emails/route')
    expect((await GET(cronRequest())).status).toBe(200)
    const html = doubles.send.mock.calls[6][0].html
    expect(html).toContain("Le modele prevoit d'affecter 30% des commissions PURAMA aux recompenses communautaires, selon les conditions du programme.")
    expect(html).not.toContain('6% du CA')
    expect(html).not.toContain('Le concours hebdomadaire est en cours')
  })
})
