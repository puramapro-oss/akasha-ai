import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readDeliveryReceipts } from './delivery-receipts-export'

const user = '11111111-1111-4111-8111-111111111111'
const response = { version: 1, user_id: user, emails: [{ email_type: 'welcome', state: 'sent' }],
  withdrawals: [{ state: 'sending' }], withdrawal_cancellations: [{ state: 'cancelled' }] }
const unavailable = { disponible: false, emails: null, retraits: null, annulations_retrait: null }
function client(data: unknown, error: unknown = null) {
  const abortSignal = vi.fn().mockResolvedValue({ data, error })
  const rpc = vi.fn().mockReturnValue({ abortSignal })
  return { rpc, abortSignal, db: { rpc } as unknown as SupabaseClient }
}

describe('personal delivery receipt projection', () => {
  it('exports only the authenticated projection without accepting a caller-selected user', async () => {
    const fixture = client(response)
    expect(await readDeliveryReceipts(fixture.db, user)).toEqual({ disponible: true,
      emails: response.emails, retraits: response.withdrawals, annulations_retrait: response.withdrawal_cancellations })
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('export_own_delivery_receipts')
    expect(fixture.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['foreign actor', { ...response, user_id: '22222222-2222-4222-8222-222222222222' }],
    ['no receipt', null], ['wrong version', { ...response, version: 2 }],
    ['missing email section', { ...response, emails: null }],
    ['missing withdrawal section', { ...response, withdrawals: {} }],
    ['missing cancellation section', { ...response, withdrawal_cancellations: undefined }],
  ])('does not mislabel %s as an empty history', async (_label, value) => {
    expect(await readDeliveryReceipts(client(value).db, user)).toEqual(unavailable)
  })

  it('does not accept data accompanied by a database error', async () => {
    expect(await readDeliveryReceipts(client(response, { message: 'denied' }).db, user)).toEqual(unavailable)
  })

  it('keeps an unavailable projection explicit after a thrown transport error', async () => {
    const fixture = client(response)
    fixture.abortSignal.mockRejectedValue(new Error('Synthetic transport error'))
    expect(await readDeliveryReceipts(fixture.db, user)).toEqual(unavailable)
  })
})
