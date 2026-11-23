import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readShareStats, SHARE_TRACKING_TIMEOUT_MS, trackShare, type ShareClient, type ShareOperation } from './tracking'

const operation: ShareOperation = { id: '10000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000001', shareCode: 'synthetic-referral', platformId: 'native' }
const proof = { replayed: false, today_shares: 1, share_id: '20000000-0000-4000-8000-000000000001',
  transaction_id: '30000000-0000-4000-8000-000000000001', request_id: operation.id,
  user_id: operation.userId, share_code: operation.shareCode, platform_id: operation.platformId,
  points: 400, shared_at: '2026-11-22T12:00:00Z' }
function clientFor(result: unknown) {
  const abortSignal = vi.fn().mockResolvedValue(result)
  const rpc = vi.fn().mockReturnValue({ abortSignal })
  const from = vi.fn(() => { throw new Error('Direct reward writes are forbidden') })
  return { client: { rpc, from } as unknown as ShareClient, rpc, from, abortSignal }
}
afterEach(() => vi.useRealTimers())

describe('authenticated share transaction transport', () => {
  it('submits no client-selected reward and accepts the exact server receipt', async () => {
    const { client, rpc, from } = clientFor({ data: proof, error: null })
    expect(await trackShare(client, operation)).toEqual(proof)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('record_social_share_checked', {
      p_request_id: operation.id,
      p_share_code: operation.shareCode, p_platform_hint: 'native',
      p_expected_user_id: operation.userId,
    })
    expect(from).not.toHaveBeenCalled()
  })
  it('accepts a confirmed replay without manufacturing a new operation', async () => {
    const { client, rpc } = clientFor({ data: { ...proof, replayed: true }, error: null })
    expect((await trackShare(client, operation)).replayed).toBe(true)
    expect(rpc.mock.calls[0][1].p_request_id).toBe(operation.id)
  })
  it.each([
    ['unknown write failure', { code: 'XX000', message: 'private backend detail' }, true],
    ['quota', { code: 'P0001', message: 'maximum 3 shares per UTC day' }, false],
    ['session mismatch', { code: '42501', message: 'share_actor_mismatch' }, false],
    ['checked session mismatch', { code: '42501', message: 'AKASHA_SHARE_SESSION_MISMATCH' }, true],
    ['referral changed', { code: '22023', message: 'share_referral_changed' }, false],
    ['conflicting replay', { code: '22023', message: 'share_operation_conflict' }, true],
  ])('does not turn %s into a successful receipt', async (_name, error, uncertain) => {
    const { client } = clientFor({ data: proof, error })
    await expect(trackShare(client, operation)).rejects.toMatchObject({ name: 'ShareTrackingError', uncertain })
  })
  it.each([
    null, {}, { ...proof, points: 999 }, { ...proof, user_id: 'other' },
    { ...proof, request_id: 'other' }, { ...proof, platform_id: 'telegram' },
    { ...proof, share_code: 'other' }, { ...proof, transaction_id: null },
    { ...proof, share_id: ' ' }, { ...proof, shared_at: 'not a date' },
    { ...proof, replayed: 'published' }, { ...proof, today_shares: -1 },
  ])('rejects an incomplete or unrelated receipt %j', async data => {
    await expect(trackShare(clientFor({ data, error: null }).client, operation))
      .rejects.toMatchObject({ uncertain: true })
  })
  it('rejects invalid operations before calling the server', async () => {
    const { client, rpc } = clientFor({ data: proof, error: null })
    await expect(trackShare(client, { ...operation, id: 'invalid' })).rejects.toMatchObject({ uncertain: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('bounds an unresponsive transport, aborts it, and retains an uncertain outcome', async () => {
    vi.useFakeTimers()
    const { client, rpc, abortSignal } = clientFor(null)
    abortSignal.mockImplementation(() => new Promise(() => {}))
    const rejection = expect(trackShare(client, operation)).rejects.toMatchObject({ uncertain: true })
    await vi.advanceTimersByTimeAsync(SHARE_TRACKING_TIMEOUT_MS)
    await rejection
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not start a write for an already revoked session', async () => {
    const { client, rpc } = clientFor(null), controller = new AbortController()
    controller.abort()
    await expect(trackShare(client, operation, controller.signal)).rejects.toMatchObject({ uncertain: true })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not start a write after the actor ownership callback was revoked', async () => {
    const { client, rpc } = clientFor(null)
    await expect(trackShare(client, operation, undefined, () => false)).rejects.toMatchObject({ uncertain: true })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('revokes a pending transport without assuming that the database rolled back', async () => {
    const { client, abortSignal } = clientFor(null), controller = new AbortController()
    abortSignal.mockImplementation(() => new Promise(() => {}))
    const rejection = expect(trackShare(client, operation, controller.signal)).rejects.toMatchObject({ uncertain: true })
    controller.abort()
    await rejection
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true)
  })
})

describe('checked share transport through the real Supabase SDK', () => {
  function sdk(transport: (request: Request) => Promise<Response>) {
    const requests: Request[] = []
    const client = createClient('https://synthetic-share.invalid', 'synthetic-key', {
      db: { schema: 'akasha_ai' },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const request = new Request(input, init)
        if (new URL(request.url).origin !== 'https://synthetic-share.invalid') throw new Error('External request forbidden')
        requests.push(request)
        return transport(request)
      } },
    })
    return { client, requests }
  }
  const response = () => Response.json(proof)

  it('sends the expected actor and original UUID to the checked RPC without selecting the reward', async () => {
    const { client, requests } = sdk(async () => response())
    expect(await trackShare(client, operation)).toEqual(proof)
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/record_social_share_checked')
    expect(request.headers.get('content-profile')).toBe('akasha_ai')
    expect(await request.json()).toEqual({ p_request_id: operation.id, p_share_code: operation.shareCode,
      p_platform_hint: operation.platformId, p_expected_user_id: operation.userId })
  })
  it('sends no request when the signal was already aborted', async () => {
    const { client, requests } = sdk(async () => response()), controller = new AbortController()
    controller.abort()
    await expect(trackShare(client, operation, controller.signal)).rejects.toMatchObject({ uncertain: true })
    expect(requests).toHaveLength(0)
  })
  it('rejects a response that arrives after actor ownership changes', async () => {
    let current = true
    const { client, requests } = sdk(async () => { current = false; return response() })
    await expect(trackShare(client, operation, undefined, () => current)).rejects.toMatchObject({ uncertain: true })
    expect(requests).toHaveLength(1)
  })
  it('settles an abort immediately even when the SDK transport ignores the signal', async () => {
    vi.useFakeTimers()
    let resolve!: (value: Response) => void
    const { client, requests } = sdk(() => new Promise(done => { resolve = done }))
    const controller = new AbortController()
    let settled = false
    const outcome = trackShare(client, operation, controller.signal).then(
      () => { throw new Error('An aborted request must not succeed') },
      error => { settled = true; return error },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(1)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(true)
    expect(await outcome).toMatchObject({ name: 'ShareTrackingError', uncertain: true })
    expect(requests[0].signal.aborted).toBe(true)
    resolve(response())
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('complete server-side share totals', () => {
  it('accepts totals larger than a PostgREST row page', async () => {
    const stats = { total_shares: 1500, points_earned: 450100, today_shares: 2 }
    const { client, rpc } = clientFor({ data: { ...stats, version: 1, user_id: operation.userId }, error: null })
    expect(await readShareStats(client, operation.userId, new AbortController().signal)).toEqual(stats)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_social_share_stats', {}, { get: true })
  })
  it.each([null, {}, { total_shares: 1, points_earned: 400, today_shares: 2 },
    { total_shares: -1, points_earned: 400, today_shares: 0 },
    { version: 1, user_id: 'another-account', total_shares: 1, points_earned: 400, today_shares: 1 },
    { version: 2, user_id: operation.userId, total_shares: 1, points_earned: 400, today_shares: 1 }])('rejects invalid totals %j', async data => {
    const value = data === null ? null : { version: 1, user_id: operation.userId, ...data }
    await expect(readShareStats(clientFor({ data: value, error: null }).client, operation.userId,
      new AbortController().signal)).rejects.toThrow('Impossible de charger')
  })
})
