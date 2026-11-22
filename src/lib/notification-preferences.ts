// Defaults for the settings screen. Optional email delivery separately requires
// an explicit stored newsletter opt-in; UI defaults never create consent.
export const DEFAULT_NOTIFICATIONS: Readonly<Record<string, boolean>> = Object.freeze({
  product_updates: true,
  agent_notifications: true,
  quota_alerts: true,
  newsletter: false,
  marketplace_notifications: true,
  weekly_digest: true,
})
