/** The blank window is still same-origin when its opener and referrer are removed. */
export function openShareDestination(url: string): boolean {
  let popup: Window | null = null
  try {
    if (!['https:', 'mailto:', 'sms:'].includes(new URL(url).protocol)) return false
    // `noopener` in window.open returns null even on success. Do not confuse it with a blocked popup.
    popup = window.open('about:blank', '_blank')
    if (!popup || popup.closed) return false
    popup.opener = null
    const policy = popup.document.createElement('meta')
    policy.name = 'referrer'
    policy.content = 'no-referrer'
    popup.document.head.append(policy)
    // Attach the policy to the navigation itself, inside the popup document.
    const link = popup.document.createElement('a')
    link.href = url
    link.target = '_self'
    link.referrerPolicy = 'no-referrer'
    link.rel = 'noreferrer noopener'
    popup.document.body.append(link)
    link.click()
    return true
  } catch {
    try { popup?.close() } catch { /* A browser-owned window can already be unavailable. */ }
    return false
  }
}
