// =============================================================================
// AKASHA AI — useReferralStats Hook
// Charge les stats de parrainage et commissions
// =============================================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { ReferralStats } from './home-types';

export function useReferralStats(userId: string | undefined) {
  const [stats, setStats] = useState<ReferralStats>({
    count: 0,
    totalCommissions: 0,
    ambassadorTier: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const load = async () => {
      try {
        const [{ count: refCount }, commissionsRes, ambassadorRes] = await Promise.all([
          supabase
            .from('referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', userId),
          supabase
            .from('commissions')
            .select('amount')
            .eq('referrer_id', userId),
          supabase
            .from('influencer_profiles')
            .select('tier')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        const sum = (commissionsRes.data ?? []).reduce(
          (acc, c) => acc + Number(c.amount ?? 0),
          0,
        );

        setStats({
          count: refCount ?? 0,
          totalCommissions: sum,
          ambassadorTier: (ambassadorRes.data?.tier as string) ?? null,
        });
      } catch {
        /* silencieux — blocs restent avec valeurs par défaut */
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [userId]);

  return { stats, loading };
}
