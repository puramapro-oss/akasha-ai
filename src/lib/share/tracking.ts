import type { SupabaseClient } from '@supabase/supabase-js'
import { getPendingRequestId, clearPendingRequest, withPendingRequestLock } from '@/lib/idempotency/browser-request'

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
  options: { requestId?: string; signal?: AbortSignal; isCurrent?: () => boolean } = {},
): Promise<ShareReceipt> {
  const assertCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false) {
      throw new Error('La session a changé pendant le suivi du partage.')
    }
  }
  assertCurrent()
  const key = `akasha-share-pending/v1/${userId}/${platformId}`
  if (options.requestId) return confirmShareReceipt(supabase, userId, referralCode, platformId, options.requestId, assertCurrent, options.signal)
  return withPendingRequestLock(key, async () => {
    assertCurrent()
    const requestId = getPendingRequestId(key)
    const receipt = await confirmShareReceipt(supabase, userId, referralCode, platformId, requestId, assertCurrent, options.signal)
    assertCurrent()
    clearPendingRequest(key, requestId)
    return receipt
  })
}

async function confirmShareReceipt(
  supabase: Pick<SupabaseClient, 'rpc'>, userId: string, referralCode: string,
  platformId: string, requestId: string, assertCurrent: () => void, signal?: AbortSignal,
): Promise<ShareReceipt> {
  assertCurrent()
  const controller = new AbortController()
  let interrupt!: (error: Error) => void
  let timer: ReturnType<typeof setTimeout> | undefined
  const confirmation = new Promise<never>((_resolve, reject) => {
    interrupt = reject
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Confirmation indisponible. Réessaie pour vérifier le même partage.'))
    }, SHARE_CONFIRMATION_TIMEOUT_MS)
  })
  const abort = () => {
    controller.abort()
    interrupt(new Error('La session a changé pendant le suivi du partage.'))
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const query = supabase.rpc('record_social_share_checked', {
      p_request_id: requestId, p_share_code: referralCode, p_platform_hint: platformId, p_expected_user_id: userId,
    })
    const { data, error } = await Promise.race([
      typeof query.abortSignal === 'function' ? query.abortSignal(controller.signal) : query, confirmation,
    ])
    assertCurrent()
    if (error) throw new Error('Impossible de confirmer le suivi du partage.')

    if (!data || typeof data !== 'object' || data.user_id !== userId || data.request_id !== requestId
      || typeof data.share_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.share_id)
      || ![300, 400].includes(data.points) || !Number.isSafeInteger(data.today_shares)
      || data.today_shares < 0 || typeof data.replayed !== 'boolean') {
      throw new Error('Confirmation du partage invalide. Actualise avant de réessayer.')
    }
    return data as ShareReceipt
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function calculateSharePoints(todayShares: number): number {
  return todayShares === 0 ? 400 : 300
}
