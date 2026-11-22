import { describe, expect, it, vi } from 'vitest'
import { trackShare } from './tracking'

const USER = '00000000-0000-4000-8000-000000000001'
const REQUEST = '00000000-0000-4000-8000-000000000002'
const receipt = { user_id: USER, request_id: REQUEST, share_id: '00000000-0000-4000-8000-000000000003',
  points: 400, today_shares: 1, replayed: false }
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
    { ...receipt, request_id: 'different-request' }])('rejects an absent or mismatched receipt %j', async data => {
    await expect(trackShare(client(data) as never, USER, 'ref', 'whatsapp', 400, 'WhatsApp', { requestId: REQUEST })).rejects.toThrow()
  })
  it('delegates both writes and the reward amount to one authenticated RPC', async () => {
    const supabase = client()
    const result = await trackShare(supabase as never, USER, 'ref', 'whatsapp', 9000, 'Untrusted label', { requestId: REQUEST })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('record_social_share', {
      p_request_id: REQUEST, p_share_code: 'ref', p_platform_hint: 'whatsapp',
    })
    expect(result).toEqual(receipt)
  })
})
