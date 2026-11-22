// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { trackShare } from './tracking'

const USER = '00000000-0000-4000-8000-000000000001'
const REQUEST = '00000000-0000-4000-8000-000000000002'
const receipt = { user_id: USER, request_id: REQUEST, share_id: '00000000-0000-4000-8000-000000000003',
  points: 400, today_shares: 1, replayed: false }
const KEY = `akasha-share-pending/v1/${USER}/whatsapp`
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_key, _options, operation) => operation({ name: KEY, mode: 'exclusive' })) } })
})
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
function client(data: unknown = receipt, error: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ data: null, error })
  const from = vi.fn(() => ({ insert }))
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { from, rpc }
}

describe('share tracking requires a canonical atomic receipt', () => {
  it('does not swallow a resolved database error', async () => {
    const supabase = client(null, { message: 'synthetic write refusal' })
    await expect(trackShare(supabase as never, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { requestId: REQUEST })).rejects.toThrow()
  })
  it.each([null, {}, { ...receipt, user_id: 'other-user' }, { ...receipt, points: 9000 },
    { ...receipt, request_id: 'different-request' }, { ...receipt, share_id: ' ' }])('rejects an absent or mismatched receipt %j', async data => {
    await expect(trackShare(client(data) as never, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { requestId: REQUEST })).rejects.toThrow()
  })
  it('delegates both writes and the reward amount to one authenticated RPC', async () => {
    const supabase = client()
    const result = await trackShare(supabase as never, USER, 'ref', 'whatsapp', 9000, 'Untrusted label', { requestId: REQUEST })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('record_social_share_checked', {
      p_request_id: REQUEST, p_share_code: 'ref', p_platform_hint: 'whatsapp', p_expected_user_id: USER,
    })
    expect(result).toEqual(receipt)
  })
})

function realClient(transport: (request: Request) => Promise<Response>) {
  const requests: Request[] = []
  const supabase = createClient('https://supabase.invalid', 'synthetic-anon', {
    db: { schema: 'akasha_ai' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init)
      if (new URL(request.url).origin !== 'https://supabase.invalid') throw new Error('External request forbidden')
      requests.push(request)
      return transport(request)
    } },
  })
  return { supabase, requests }
}

it('sends the expected actor through the real SDK without a client-chosen reward amount', async () => {
  const f = realClient(async () => Response.json(receipt))
  await trackShare(f.supabase, USER, 'ref', 'whatsapp', 9000, 'Untrusted label', { requestId: REQUEST })
  expect(new URL(f.requests[0].url).pathname).toBe('/rest/v1/rpc/record_social_share_checked')
  expect(f.requests[0].headers.get('content-profile')).toBe('akasha_ai')
  expect(await f.requests[0].json()).toEqual({ p_request_id: REQUEST, p_share_code: 'ref',
    p_platform_hint: 'whatsapp', p_expected_user_id: USER })
})

it('does not send an already-aborted operation or persist a new attempt', async () => {
  const controller = new AbortController()
  controller.abort()
  const f = realClient(async () => Response.json(receipt))
  await expect(trackShare(f.supabase, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { signal: controller.signal })).rejects.toThrow()
  expect(f.requests).toHaveLength(0)
  expect(localStorage.getItem(KEY)).toBeNull()
})

it('retains the key when an old account receipt arrives after ownership is revoked', async () => {
  let current = true
  const f = realClient(async request => {
    current = false
    const body = await request.clone().json()
    return Response.json({ ...receipt, request_id: body.p_request_id })
  })
  await expect(trackShare(f.supabase, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { isCurrent: () => current })).rejects.toThrow()
  expect(localStorage.getItem(KEY)).toBe((await f.requests[0].clone().json()).p_request_id)
})

it('settles abandonment immediately even when the transport ignores abort', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  let release!: (value: Response) => void
  const pending = new Promise<Response>(resolve => { release = resolve })
  const f = realClient(async () => pending)
  let state = 'pending'
  const operation = trackShare(f.supabase, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { signal: controller.signal })
    .then(() => { state = 'accepted' }, () => { state = 'rejected' })
  await vi.advanceTimersByTimeAsync(0)
  const sent = await f.requests[0].clone().json()
  controller.abort()
  await vi.advanceTimersByTimeAsync(0)
  const afterAbort = state
  release(Response.json({ ...receipt, request_id: sent.p_request_id }))
  await operation
  expect(afterAbort).toBe('rejected')
  expect(f.requests[0].signal.aborted).toBe(true)
  expect(localStorage.getItem(KEY)).toBe(sent.p_request_id)
})
