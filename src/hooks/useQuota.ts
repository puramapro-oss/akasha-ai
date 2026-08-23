import { useState, useEffect, useCallback } from 'react'
import type { QuotaInfo } from '@/types/chat'

export function useQuota() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null)

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/quota/check')
      if (res.ok) {
        const data = (await res.json()) as QuotaInfo
        setQuota(data)
      }
    } catch {
      // graceful
    }
  }, [])

  useEffect(() => {
    fetchQuota()
  }, [fetchQuota])

  return { quota, fetchQuota }
}
