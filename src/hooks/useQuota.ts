import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { useAsyncResource } from './useAsyncResource'
import type { QuotaInfo } from '@/types/chat'

export function useQuota() {
  const { user } = useAuth()
  const load = useCallback(async (signal: AbortSignal): Promise<QuotaInfo> => {
    const response = await fetch('/api/quota/check', { signal, cache: 'no-store' })
    if (!response.ok) throw new Error('Impossible de charger le quota.')
    return await response.json() as QuotaInfo
  }, [])
  const resource = useAsyncResource<QuotaInfo | null>(user?.id ?? null, load, null)
  return { quota: resource.data, fetchQuota: resource.refetch, error: resource.error }
}
