'use client'

import { useSyncExternalStore } from 'react'
import { readPendingRequestId, subscribePendingRequests } from '@/lib/idempotency/browser-request'

export function usePendingRequestIds(keys: readonly string[]) {
  const snapshot = useSyncExternalStore(subscribePendingRequests,
    () => JSON.stringify(keys.map(readPendingRequestId)), () => '[]')
  const ids = JSON.parse(snapshot) as Array<string | null>
  return new Map(keys.map((key, index) => [key, ids[index] ?? null]))
}
