import type { SupabaseClient } from '@supabase/supabase-js'

export interface ShareStats {
  total_shares: number
  points_earned: number
  today_shares: number
}

export type ShareClient = Pick<SupabaseClient, 'rpc'>
export type ShareOperation = { id: string; userId: string; shareCode: string; platformId: string }
export type ShareReceipt = {
  replayed: boolean; today_shares: number; share_id: string; transaction_id: string
  request_id: string; user_id: string; share_code: string; platform_id: string
  points: 300 | 400; shared_at: string
}
export const SHARE_TRACKING_TIMEOUT_MS = 15_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLATFORM_IDS = ['whatsapp', 'telegram', 'twitter', 'facebook', 'linkedin', 'email', 'sms', 'native']

export class ShareTrackingError extends Error {
  constructor(message: string, public readonly uncertain = true) { super(message); this.name = 'ShareTrackingError' }
}

export function isShareOperation(value: unknown): value is ShareOperation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && UUID.test(row.id) && typeof row.userId === 'string' && UUID.test(row.userId)
    && typeof row.shareCode === 'string' && row.shareCode.trim() === row.shareCode && row.shareCode.length > 0
    && row.shareCode.length <= 128 && typeof row.platformId === 'string' && PLATFORM_IDS.includes(row.platformId)
}

function receipt(value: unknown, operation: ShareOperation): ShareReceipt {
  const row = value as Partial<ShareReceipt> | null
  if (!row || typeof row.replayed !== 'boolean' || !Number.isSafeInteger(row.today_shares) || row.today_shares! < 0
    || row.user_id !== operation.userId || row.request_id !== operation.id || row.platform_id !== operation.platformId
    || row.share_code !== operation.shareCode || !UUID.test(row.share_id ?? '') || !UUID.test(row.transaction_id ?? '')
    || ![300, 400].includes(row.points ?? 0) || typeof row.shared_at !== 'string' || !Number.isFinite(Date.parse(row.shared_at))) {
    throw new ShareTrackingError('Le suivi n’a pas pu être confirmé. Vérifie cette même demande avant de recommencer.')
  }
  return row as ShareReceipt
}

/** One authenticated transaction. A lost response is retried only with the SAME operation id. */
export async function trackShare(client: ShareClient, operation: ShareOperation, signal?: AbortSignal,
  isCurrent: () => boolean = () => true): Promise<ShareReceipt> {
  const assertCurrent = () => {
    if (signal?.aborted || !isCurrent()) {
      throw new ShareTrackingError('La session a changé. Vérifie le suivi depuis le compte concerné.')
    }
  }
  assertCurrent()
  if (!isShareOperation(operation)) throw new ShareTrackingError('La demande de suivi est invalide.', false)
  const controller = new AbortController()
  let reject!: (reason: Error) => void
  const interrupted = new Promise<never>((_resolve, fail) => { reject = fail })
  const abort = () => { controller.abort(); reject(new ShareTrackingError('La confirmation est indisponible. Vérifie cette même demande.')) }
  const timer = setTimeout(abort, SHARE_TRACKING_TIMEOUT_MS)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    assertCurrent()
    const result = await Promise.race([client.rpc('record_social_share_checked', {
      p_request_id: operation.id, p_share_code: operation.shareCode, p_platform_hint: operation.platformId,
      p_expected_user_id: operation.userId,
    }).abortSignal(controller.signal), interrupted])
    assertCurrent()
    if (result.error) {
      const { code, message } = result.error
      if (code === '42501' && message === 'AKASHA_SHARE_SESSION_MISMATCH') {
        // This actor cannot establish whether the intended account's earlier
        // attempt committed. Keep its UUID available to that account.
        throw new ShareTrackingError('La session a changé. Vérifie le suivi depuis le compte concerné.')
      }
      if (code === 'P0001' && message === 'maximum 3 shares per UTC day') {
        throw new ShareTrackingError('La limite de trois participations pour cette journée UTC est atteinte.', false)
      }
      if (code === '42501' || (code === '22023' && !message.startsWith('share_operation_conflict'))) {
        throw new ShareTrackingError('Le compte ou le lien de partage a changé. Actualise avant de recommencer.', false)
      }
      throw new ShareTrackingError('Impossible de confirmer le suivi du partage. Vérifie cette même demande.')
    }
    return receipt(result.data as unknown, operation)
  } catch (error) {
    if (error instanceof ShareTrackingError) throw error
    throw new ShareTrackingError('La confirmation est indisponible. Vérifie cette même demande.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function readShareStats(client: ShareClient, userId: string, signal: AbortSignal): Promise<ShareStats> {
  const { data, error } = await client.rpc('get_social_share_stats', {}, { get: true }).abortSignal(signal)
  const row = data as (Partial<ShareStats> & { version?: number; user_id?: string }) | null
  if (error || !row || row.version !== 1 || row.user_id !== userId || ![row.total_shares, row.points_earned, row.today_shares]
    .every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    || row.today_shares! > row.total_shares!) throw new Error('Impossible de charger les partages.')
  return { total_shares: row.total_shares!, points_earned: row.points_earned!, today_shares: row.today_shares! }
}
