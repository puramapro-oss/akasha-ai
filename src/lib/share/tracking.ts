import type { SupabaseClient } from '@supabase/supabase-js'
import { getPendingRequestId, clearPendingRequest } from '@/lib/idempotency/browser-request'

export interface ShareStats {
  total_shares: number
  points_earned: number
  today_shares: number
}

export interface ShareReceipt {
  user_id: string
  request_id: string
  share_id: string
  points: number
  today_shares: number
  replayed: boolean
}

export const SHARE_CONFIRMATION_TIMEOUT_MS = 15_000

export async function trackShare(
  supabase: Pick<SupabaseClient, 'rpc'>,
  userId: string,
  referralCode: string,
  platformId: string,
  _points: number,
  _platformName: string,
  options: { requestId?: string; signal?: AbortSignal } = {},
): Promise<ShareReceipt> {
  const key = `akasha-share-pending/v1/${userId}/${platformId}`
  const requestId = options.requestId ?? getPendingRequestId(key)
  const query = supabase.rpc('record_social_share', {
    p_request_id: requestId, p_share_code: referralCode, p_platform_hint: platformId,
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const confirmation = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Confirmation indisponible. Réessaie pour vérifier le même partage.')),
      SHARE_CONFIRMATION_TIMEOUT_MS)
  })
  const { data, error } = await Promise.race([options.signal ? query.abortSignal(options.signal) : query, confirmation])
    .finally(() => clearTimeout(timer))
  if (error) throw new Error('Impossible de confirmer le suivi du partage.')

  if (!data || typeof data !== 'object' || data.user_id !== userId || data.request_id !== requestId
    || typeof data.share_id !== 'string' || !data.share_id
    || ![300, 400].includes(data.points) || !Number.isSafeInteger(data.today_shares)
    || data.today_shares < 0 || typeof data.replayed !== 'boolean') {
    throw new Error('Confirmation du partage invalide. Actualise avant de réessayer.')
  }
  if (!options.requestId) clearPendingRequest(key, requestId)
  return data as ShareReceipt
}

export function calculateSharePoints(todayShares: number): number {
  return todayShares === 0 ? 400 : 300
}
