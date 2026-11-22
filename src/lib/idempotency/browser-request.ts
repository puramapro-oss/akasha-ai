const pendingRequests = new Map<string, string>()
const listeners = new Set<() => void>()
export function subscribePendingRequests(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function readPendingRequestId(key: string): string | null {
  const pending = pendingRequests.get(key)
  if (pending) return pending
  let stored: string | null = null
  try { stored = globalThis.sessionStorage?.getItem(key) ?? null }
  catch { /* Private browsing can deny storage; the in-memory request still stays stable. */ }
  return stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
    ? stored : null
}
export function getPendingRequestId(key: string): string {
  const id = readPendingRequestId(key) ?? crypto.randomUUID()
  pendingRequests.set(key, id)
  try { globalThis.sessionStorage?.setItem(key, id) }
  catch { /* Keep the in-memory recovery key if browser storage is unavailable. */ }
  listeners.forEach(listener => listener())
  return id
}
export function clearPendingRequest(key: string, requestId: string) {
  if (pendingRequests.get(key) === requestId) pendingRequests.delete(key)
  try { if (globalThis.sessionStorage?.getItem(key) === requestId) globalThis.sessionStorage.removeItem(key) }
  catch { /* Persistence is best-effort; replaying an old key never credits it twice. */ }
  listeners.forEach(listener => listener())
}
