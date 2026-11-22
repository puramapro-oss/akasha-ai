import type { SupabaseClient } from '@supabase/supabase-js'

export type DeliveryReceiptsExport = {
  disponible: boolean
  emails: unknown[] | null
  retraits: unknown[] | null
  annulations_retrait: unknown[] | null
}

/** Keep private journal tables private; export only their authenticated projection. */
export async function readDeliveryReceipts(client: Pick<SupabaseClient, 'rpc'>, userId: string): Promise<DeliveryReceiptsExport> {
  try {
    const { data, error } = await client.rpc('export_own_delivery_receipts')
      .abortSignal(AbortSignal.timeout(10_000))
    const value = data as Record<string, unknown> | null
    if (error || !value || value.version !== 1 || value.user_id !== userId
      || !Array.isArray(value.emails) || !Array.isArray(value.withdrawals)
      || !Array.isArray(value.withdrawal_cancellations)) {
      throw new Error('Delivery receipt export unavailable')
    }
    return { disponible: true, emails: value.emails, retraits: value.withdrawals,
      annulations_retrait: value.withdrawal_cancellations }
  } catch {
    // Unknown is not an empty history. The rest of the user's export remains usable.
    return { disponible: false, emails: null, retraits: null, annulations_retrait: null }
  }
}
