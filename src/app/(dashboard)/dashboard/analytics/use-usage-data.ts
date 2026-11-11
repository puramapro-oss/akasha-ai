import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import type { UsageDaily, UsageStats } from './analytics-types'

type UsageData = { usageData: UsageDaily[]; stats: UsageStats }
export function useUsageData(userId: string | undefined) {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<UsageData> => {
    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 6)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const [week, month] = await Promise.all([
      supabase.from('usage_daily').select('date, chat_count, image_count, audio_count, code_count')
        .eq('user_id', userId!).gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true }).abortSignal(signal),
      supabase.from('usage_daily').select('chat_count, image_count, audio_count, code_count')
        .eq('user_id', userId!).gte('date', monthStart.toISOString().split('T')[0]).abortSignal(signal),
    ])
    if (week.error || month.error) throw new Error('Impossible de charger les statistiques.')
    const rows = (week.data ?? []) as UsageDaily[]
    const sum = (row: { chat_count: number; image_count: number; audio_count: number; code_count: number }) =>
      (row.chat_count ?? 0) + (row.image_count ?? 0) + (row.audio_count ?? 0) + (row.code_count ?? 0)
    const todayRow = rows.find(row => row.date === today.toISOString().split('T')[0])
    return {
      usageData: rows,
      stats: { todayTotal: todayRow ? sum(todayRow) : 0, monthTotal: (month.data ?? []).reduce((total, row) => total + sum(row), 0) },
    }
  }, [userId, supabase])
  const resource = useAsyncResource<UsageData>(userId ?? null, load, { usageData: [], stats: { todayTotal: 0, monthTotal: 0 } })
  return { ...resource.data, loading: resource.loading, error: resource.error }
}
