type ScheduledType = 'welcome' | 'tip_day1' | 'relaunch_day3' | 'tips_day7'
  | 'upgrade_day14' | 'testimonial_day21' | 'winback_day30'
type Category = 'product_updates' | 'weekly_digest' | 'newsletter'

const CATEGORIES: Record<ScheduledType, Category> = {
  welcome: 'product_updates', tip_day1: 'product_updates', tips_day7: 'weekly_digest',
  relaunch_day3: 'newsletter', upgrade_day14: 'newsletter', testimonial_day21: 'newsletter',
  winback_day30: 'newsletter',
}
// Keep the same defaults as the settings screen. Marketing needs newsletter opt-in.
const DEFAULTS: Record<Category, boolean> = { product_updates: true, weekly_digest: true, newsletter: false }

export function canSendSequence(type: string, row: unknown, userId: string, now: Date): boolean {
  const category = CATEGORIES[type as ScheduledType]
  if (!category) return false
  if (row === null) return DEFAULTS[category]
  if (!row || typeof row !== 'object' || !('user_id' in row) || row.user_id !== userId) {
    throw new Error('Invalid notification preferences')
  }
  if ('paused_until' in row && row.paused_until !== null && row.paused_until !== undefined) {
    const pause = typeof row.paused_until === 'string' ? Date.parse(row.paused_until) : NaN
    if (!Number.isFinite(pause)) throw new Error('Invalid notification pause')
    if (pause > now.getTime()) return false
  }
  const types = 'types' in row ? row.types : null
  if (types === null || types === undefined) return DEFAULTS[category]
  if (typeof types !== 'object' || Array.isArray(types)) throw new Error('Invalid notification categories')
  if (!Object.hasOwn(types, category)) return DEFAULTS[category]
  return (types as Record<string, unknown>)[category] === true
}
