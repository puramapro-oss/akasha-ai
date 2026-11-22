import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(rpc).toHaveBeenCalledExactlyOnceWith('record_social_share', {
      p_request_id: operation.id,
      p_share_code: operation.shareCode, p_platform_hint: 'native',
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
    { ...proof, shared_at: 'not a date' }, { ...proof, replayed: 'published' }, { ...proof, today_shares: -1 },
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
  it('revokes a pending transport without assuming that the database rolled back', async () => {
    const { client, abortSignal } = clientFor(null), controller = new AbortController()
    abortSignal.mockImplementation(() => new Promise(() => {}))
    const rejection = expect(trackShare(client, operation, controller.signal)).rejects.toMatchObject({ uncertain: true })
    controller.abort()
    await rejection
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true)
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
