// =============================================================================
// AKASHA AI — useUsageData Hook
// Charge les données d'usage (7 jours + mois)
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { UsageDaily, UsageStats } from './analytics-types';

export function useUsageData(userId: string | undefined) {
  const [usageData, setUsageData] = useState<UsageDaily[]>([]);
  const [stats, setStats] = useState<UsageStats>({ todayTotal: 0, monthTotal: 0 });
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchUsage = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const { data } = await supabase
      .from('usage_daily')
      .select('date, chat_count, image_count, audio_count, code_count')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (data) {
      setUsageData(data as UsageDaily[]);

      const todayStr = today.toISOString().split('T')[0];
      const todayRow = data.find((d) => d.date === todayStr);
      const todaySum = todayRow
        ? (todayRow.chat_count ?? 0) +
          (todayRow.image_count ?? 0) +
          (todayRow.audio_count ?? 0) +
          (todayRow.code_count ?? 0)
        : 0;

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: monthData } = await supabase
        .from('usage_daily')
        .select('chat_count, image_count, audio_count, code_count')
        .eq('user_id', userId)
        .gte('date', monthStart.toISOString().split('T')[0]);

      const monthSum = monthData?.reduce(
        (acc, row) =>
          acc +
          (row.chat_count ?? 0) +
          (row.image_count ?? 0) +
          (row.audio_count ?? 0) +
          (row.code_count ?? 0),
        0
      ) ?? 0;

      setStats({ todayTotal: todaySum, monthTotal: monthSum });
    }
    setLoading(false);
  }, [userId, supabase]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return { usageData, stats, loading };
}
