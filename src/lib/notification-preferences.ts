// Shared by settings and delivery so an absent preference has the same meaning.
export const DEFAULT_NOTIFICATIONS: Readonly<Record<string, boolean>> = Object.freeze({
  product_updates: true,
  agent_notifications: true,
  quota_alerts: true,
  newsletter: false,
  marketplace_notifications: true,
  weekly_digest: true,
})
