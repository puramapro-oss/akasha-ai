import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import type { ReferralStats } from './home-types'

export function useReferralStats(userId: string | undefined) {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<ReferralStats> => {
    const [referrals, commissions, ambassador] = await Promise.all([
      supabase.from('referrals').select('id', { count: 'exact', head: true })
        .eq('referrer_id', userId!).abortSignal(signal),
      supabase.from('commissions').select('amount').eq('referrer_id', userId!).abortSignal(signal),
      supabase.from('influencer_profiles').select('tier').eq('user_id', userId!).abortSignal(signal).maybeSingle(),
    ])
    if (referrals.error || commissions.error || ambassador.error || referrals.count === null) {
      throw new Error('Impossible de charger les statistiques de parrainage.')
    }
    return {
      count: referrals.count,
      totalCommissions: (commissions.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      ambassadorTier: (ambassador.data?.tier as string) ?? null,
    }
  }, [userId, supabase])
  const resource = useAsyncResource(userId ?? null, load, {
    count: 0, totalCommissions: 0, ambassadorTier: null,
  } as ReferralStats)
  return { stats: resource.data, loading: resource.loading, error: resource.error }
}
