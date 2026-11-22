import { DEFAULT_NOTIFICATIONS } from '@/lib/notification-preferences'

export type ScheduledType = 'welcome' | 'tip_day1' | 'relaunch_day3' | 'tips_day7'
  | 'upgrade_day14' | 'testimonial_day21' | 'winback_day30'
type Category = 'product_updates' | 'weekly_digest' | 'newsletter'

const CATEGORIES: Record<ScheduledType, Category> = {
  welcome: 'product_updates', tip_day1: 'product_updates', tips_day7: 'weekly_digest',
  relaunch_day3: 'newsletter', upgrade_day14: 'newsletter', testimonial_day21: 'newsletter',
  winback_day30: 'newsletter',
}
// The settings screen and delivery policy share one default set; marketing requires opt-in.

export function canSendSequence(type: string, row: unknown, userId: string, now: Date): boolean {
  const category = CATEGORIES[type as ScheduledType]
  if (!category) return false
  if (row === null) return DEFAULT_NOTIFICATIONS[category]
  if (!row || typeof row !== 'object' || !('user_id' in row) || row.user_id !== userId) {
    throw new Error('Invalid notification preferences')
  }
  if ('paused_until' in row && row.paused_until !== null && row.paused_until !== undefined) {
    const pause = typeof row.paused_until === 'string' ? Date.parse(row.paused_until) : NaN
    if (!Number.isFinite(pause)) throw new Error('Invalid notification pause')
    if (pause > now.getTime()) return false
  }
  const types = 'types' in row ? row.types : null
  if (types === null || types === undefined) return DEFAULT_NOTIFICATIONS[category]
  if (typeof types !== 'object' || Array.isArray(types)) throw new Error('Invalid notification categories')
  if (!Object.hasOwn(types, category)) return DEFAULT_NOTIFICATIONS[category]
  return (types as Record<string, unknown>)[category] === true
}
