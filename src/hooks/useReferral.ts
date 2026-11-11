'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { useAsyncResource } from './useAsyncResource'
import { APP_DOMAIN } from '@/lib/constants'

export function useReferral() {
  const { user, profile } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal) => {
    const { count, error } = await supabase.from('referrals').select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId!).abortSignal(signal)
    if (error || count === null) throw new Error('Impossible de charger les parrainages.')
    return count
  }, [userId, supabase])
  const resource = useAsyncResource(userId ?? null, load, 0)
  const referralCount = resource.data
  const tier = referralCount >= 100 ? 'legende' : referralCount >= 75 ? 'diamant'
    : referralCount >= 50 ? 'platine' : referralCount >= 25 ? 'or'
      : referralCount >= 10 ? 'argent' : referralCount >= 5 ? 'bronze' : 'debutant'
  const referralCode = profile?.referral_code ?? ''
  const referralLink = referralCode ? 'https://' + APP_DOMAIN + '/go/' + referralCode : ''
  return { referralLink, referralCode, referralCount, tier, loading: resource.loading, error: resource.error, refetch: resource.refetch }
}
