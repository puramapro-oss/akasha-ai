'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { PLATFORMS } from './platforms'
import { openShareDestination } from './open-destination'
import { isShareOperation, ShareTrackingError, trackShare, type ShareClient, type ShareOperation } from './tracking'
import { clearPendingRequest, getPendingRequestId, readPendingRequestId, subscribePendingRequests,
  withPendingRequestLock } from '@/lib/idempotency/browser-request'

type Options = {
  client: ShareClient; userId?: string; shareCode: string; shareLink: string; shareText: string
  todayShares: number; isCurrent: () => boolean; reload: () => Promise<void>; copy: () => Promise<void>
}
const storageKey = (userId: string) => 'akasha:pending-share:v1:' + userId
const STORAGE_ERROR = '\u0000unavailable'
const storageEvent = 'akasha-pending-share-changed'
const serverSnapshot = () => null
class SharePersistenceError extends Error {
  constructor() { super('La reprise ne peut pas être enregistrée dans ce navigateur. Aucune nouvelle attribution n’a été demandée.') }
}
function subscribe(listener: () => void) {
  const unsubscribePending = subscribePendingRequests(listener)
  window.addEventListener(storageEvent, listener)
  return () => {
    unsubscribePending()
    window.removeEventListener(storageEvent, listener)
  }
}
const requestKey = (userId: string, platformId: string) => `akasha-share-pending/v1/${userId}/${platformId}`
function stored(userId?: string, shareCode = '') {
  if (!userId) return null
  try {
    const saved = localStorage.getItem(storageKey(userId)) ?? sessionStorage.getItem(storageKey(userId))
    if (saved !== null) return saved
    // Preserve an incoming PR6 recovery key. New requests never create a
    // second key while any older platform request still needs confirmation.
    for (const platformId of [...PLATFORMS.map(platform => platform.id), 'native']) {
      const id = readPendingRequestId(requestKey(userId, platformId))
      if (id) return JSON.stringify({ id, userId, shareCode, platformId })
    }
    return null
  }
  catch { return STORAGE_ERROR }
}
function parsePending(value: string | null, userId?: string) {
  if (value === null) return { operation: null, error: false }
  try {
    const operation: unknown = JSON.parse(value)
    if (!isShareOperation(operation) || operation.userId !== userId) throw new Error('Invalid pending operation')
    return { operation, error: false }
  } catch { return { operation: null, error: true } }
}

export function useShareActions(options: Options) {
  const { client, userId, shareCode, shareLink, shareText, todayShares, isCurrent, reload, copy } = options
  const [busy, setBusy] = useState(false)
  const [writeStorageError, setStorageError] = useState(false)
  const ready = useSyncExternalStore(subscribe, () => true, () => false)
  const getSnapshot = useCallback(() => stored(userId, shareCode), [userId, shareCode])
  const saved = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
  const parsed = useMemo(() => parsePending(saved, userId), [saved, userId])
  const pending = parsed.operation
  const storageError = writeStorageError || parsed.error
  const busyRef = useRef(false)
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => { active.current?.abort() }, [userId])

  const remember = (operation: ShareOperation) => {
    try {
      const current = parsePending(stored(operation.userId, operation.shareCode), operation.userId)
      if (current.error || (current.operation && current.operation.id !== operation.id)) throw new Error('Pending operation changed')
      const canonicalKey = requestKey(operation.userId, operation.platformId)
      const known = readPendingRequestId(canonicalKey)
      if (known !== null && known !== operation.id) throw new Error('Pending operation changed')
      // Import an old rich receipt under both Web Locks. The incoming helper
      // then confirms the exact UUID in shared storage; it is not replaced.
      if (known === null) {
        if (localStorage.getItem(canonicalKey) !== null) throw new Error('Invalid pending operation')
        localStorage.setItem(canonicalKey, operation.id)
        if (localStorage.getItem(canonicalKey) !== operation.id) throw new Error('Unconfirmed pending operation')
      }
      if (getPendingRequestId(canonicalKey) !== operation.id) throw new Error('Pending operation changed')
      const value = JSON.stringify(operation)
      localStorage.setItem(storageKey(operation.userId), value)
      if (localStorage.getItem(storageKey(operation.userId)) !== value) throw new Error('Pending share was not stored')
      window.dispatchEvent(new Event(storageEvent))
    } catch { throw new SharePersistenceError() }
  }
  const forget = (operation: ShareOperation) => {
    for (const storage of [localStorage, sessionStorage]) {
      const saved = storage.getItem(storageKey(operation.userId))
      // Another pre-upgrade tab may have left a different valid intention.
      // Confirm this UUID only; preserve the other receipt for the next retry.
      if (saved !== null && JSON.parse(saved).id === operation.id) storage.removeItem(storageKey(operation.userId))
    }
    clearPendingRequest(requestKey(operation.userId, operation.platformId), operation.id)
    window.dispatchEvent(new Event(storageEvent))
  }
  const release = () => {
    busyRef.current = false
    if (isCurrent()) setBusy(false)
  }
  const submit = async (operation: ShareOperation) => {
    const controller = new AbortController()
    active.current = controller
    try {
      // The account lock protects the rich pending receipt across platforms;
      // the canonical platform lock also coordinates incoming clients.
      await withPendingRequestLock(storageKey(operation.userId), () => {
        if (!isCurrent() || controller.signal.aborted) return Promise.resolve()
        return withPendingRequestLock(requestKey(operation.userId, operation.platformId), async () => {
          if (!isCurrent() || controller.signal.aborted) return
          remember(operation)
          let result
          try { result = await trackShare(client, operation, controller.signal, isCurrent) }
          catch (error) {
            if (isCurrent() && error instanceof ShareTrackingError && !error.uncertain) {
              try { forget(operation) } catch { setStorageError(true) }
            }
            throw error
          }
          if (!isCurrent() || controller.signal.aborted) return
          try { forget(operation) }
          catch { setStorageError(true) }
          toast.info(result.replayed
            ? `Participation déjà enregistrée : ${result.points} points ont été crédités une seule fois. La publication sur le réseau n’est pas vérifiée.`
            : `Participation enregistrée : ${result.points} points ajoutés à ton solde. La publication sur le réseau n’est pas vérifiée.`)
          void reload()
        })
      })
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof SharePersistenceError) setStorageError(true)
      toast.error(error instanceof Error ? error.message : 'Impossible de confirmer le suivi du partage.')
    } finally {
      if (active.current === controller) active.current = null
      release()
    }
  }
  const begin = (platformId: string): ShareOperation | null => {
    if (!userId || !isCurrent() || !ready || parsed.error || busyRef.current || stored(userId, shareCode) !== null) return null
    if (todayShares >= 3) { toast.error('Maximum trois participations par journée UTC.'); return null }
    let operation: ShareOperation
    try { operation = { id: crypto.randomUUID(), userId, shareCode, platformId } }
    catch { toast.error('Le suivi est indisponible dans ce navigateur. Tu peux copier le lien.'); return null }
    if (!isShareOperation(operation)) { toast.error('Ton lien de partage est indisponible. Actualise la page.'); return null }
    busyRef.current = true
    setStorageError(false)
    setBusy(true)
    return operation
  }
  const recordOpened = (operation: ShareOperation) => {
    // Called only after synchronous popup opening or successful native hand-off.
    // Acquiring a Web Lock before that action would lose the browser gesture.
    void submit(operation)
  }
  const share = (platformId: string) => {
    const platform = PLATFORMS.find(item => item.id === platformId)
    if (!platform) return
    const operation = begin(platformId)
    if (!operation) return
    if (!openShareDestination(platform.getUrl(shareLink, shareText))) {
      toast.error('La fenêtre de partage n’a pas pu être ouverte. Tu peux copier le lien.')
      release()
      return
    }
    if (!isCurrent()) { release(); return }
    recordOpened(operation)
  }
  const nativeShare = async () => {
    if (!navigator.share) { await copy(); return }
    const operation = begin('native')
    if (!operation) return
    try { await navigator.share({ title: 'AKASHA AI', text: shareText, url: shareLink }) }
    catch (error) {
      if (isCurrent()) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          toast.info('Partage annulé ou aucune destination disponible.')
        }
        else toast.error('Le partage n’a pas pu être transmis à ton appareil.')
      }
      release()
      return
    }
    if (!isCurrent()) { release(); return }
    recordOpened(operation)
  }
  const retry = () => {
    const operation = parsePending(stored(userId, shareCode), userId).operation
    if (!operation || busyRef.current || !isCurrent() || operation.userId !== userId) return
    busyRef.current = true
    setStorageError(false)
    setBusy(true)
    void submit(operation)
  }
  return { share, nativeShare, retry, pending, busy, storageError,
    disabled: !ready || parsed.error || busy || pending !== null || !userId || !shareCode }
}
