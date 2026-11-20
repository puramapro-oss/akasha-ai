import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(async () => ({ error: null })),
  maybeSingle: vi.fn(async (): Promise<{ data: { id: string; referral_code: string } | null }> => ({ data: null })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      insert: mocks.insert,
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  })),
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.maybeSingle.mockResolvedValue({ data: null })
})

describe('GET /go/[slug]', () => {
  it('redirige vers /signup sans crash quand aucun coupon/referral/ambassadeur', async () => {
    const response = await GET(
      new Request('http://localhost/go/some-app'),
      { params: Promise.resolve({ slug: 'some-app' }) }
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/signup')
    expect(response.cookies.get('purama_promo')).toBeUndefined()
  })

  it('pose le cookie purama_promo (httpOnly) quand un coupon est fourni', async () => {
    const response = await GET(
      new Request('http://localhost/go/some-app?coupon=WELCOME50'),
      { params: Promise.resolve({ slug: 'some-app' }) }
    )

    const cookie = response.cookies.get('purama_promo')
    expect(cookie).toBeDefined()
    expect(cookie?.httpOnly).toBe(true)
    expect(JSON.parse(cookie!.value).coupon).toBe('WELCOME50')
  })

  it('redirige vers /signup?ref=slug quand le slug correspond à un referral_code', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { id: 'u1', referral_code: 'ally' } })

    const response = await GET(
      new Request('http://localhost/go/ally'),
      { params: Promise.resolve({ slug: 'ally' }) }
    )

    expect(response.headers.get('location')).toBe('http://localhost/signup?ref=ally')
  })

  it('ne casse jamais la redirection si le tracking cross_promos échoue', async () => {
    mocks.insert.mockRejectedValueOnce(new Error('db unavailable'))

    const response = await GET(
      new Request('http://localhost/go/some-app'),
      { params: Promise.resolve({ slug: 'some-app' }) }
    )

    expect(response.status).toBe(307)
  })
})
