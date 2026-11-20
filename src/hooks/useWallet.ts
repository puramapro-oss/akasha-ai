'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { useAsyncResource } from './useAsyncResource'

export function useWallet() {
  const { user } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase.from('wallets').select('balance, total_earned')
      .eq('user_id', userId!).abortSignal(signal).maybeSingle()
    if (error) throw new Error('Impossible de charger le portefeuille.')
    return { balance: Number(data?.balance ?? 0), totalEarned: Number(data?.total_earned ?? 0) }
  }, [userId, supabase])
  const resource = useAsyncResource(userId ?? null, load, { balance: 0, totalEarned: 0 })
  return { ...resource.data, loading: resource.loading, error: resource.error, refetch: resource.refetch }
}
