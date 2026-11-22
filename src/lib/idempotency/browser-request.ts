const pendingRequests = new Map<string, string>()
const listeners = new Set<() => void>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const notify = () => { listeners.forEach(listener => listener()) }
export function subscribePendingRequests(listener: () => void) {
  listeners.add(listener)
  globalThis.addEventListener?.('storage', listener)
  return () => {
    listeners.delete(listener)
    globalThis.removeEventListener?.('storage', listener)
  }
}
export function readPendingRequestId(key: string): string | null {
  try {
    // Preserve pending intentions created before the shared-storage upgrade.
    const stored = globalThis.localStorage?.getItem(key) ?? globalThis.sessionStorage?.getItem(key)
    return stored && UUID.test(stored) ? stored : null
  } catch { return pendingRequests.get(key) ?? null }
}

/** Hold this lock through the request and confirmation, including key removal. */
export async function withPendingRequestLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks?.request) {
    throw new Error('La confirmation sécurisée est indisponible dans ce navigateur. Aucune nouvelle attribution n’a été demandée.')
  }
  return navigator.locks.request(key, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Cette demande est déjà en cours dans un autre onglet. Réessaie après sa confirmation.')
    return operation()
  })
}
export function getPendingRequestId(key: string): string {
  try {
    const storage = globalThis.localStorage
    if (!storage) throw new Error('Storage unavailable')
    const shared = storage.getItem(key)
    const existing = shared ?? globalThis.sessionStorage?.getItem(key)
    if (existing !== null && existing !== undefined && !UUID.test(existing)) throw new Error('Invalid pending request')
    const id = existing ?? crypto.randomUUID()
    if (shared !== id) storage.setItem(key, id)
    if (storage.getItem(key) !== id) throw new Error('Unconfirmed persistence')
    pendingRequests.set(key, id)
    notify()
    return id
  } catch {
    throw new Error('La reprise ne peut pas être enregistrée dans ce navigateur. Aucune nouvelle attribution n’a été demandée.')
  }
}
export function clearPendingRequest(key: string, requestId: string) {
  try {
    if (globalThis.localStorage?.getItem(key) === requestId) globalThis.localStorage.removeItem(key)
    if (globalThis.sessionStorage?.getItem(key) === requestId) globalThis.sessionStorage.removeItem(key)
    if (pendingRequests.get(key) === requestId) pendingRequests.delete(key)
  } catch { /* A confirmed result stays confirmed; preserving its key permits a safe replay. */ }
  notify()
}
