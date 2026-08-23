import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { BadgeItem, LeaderboardEntry, LeaderboardTab } from '@/types/xp'

export function useXPData() {
  const { user } = useAuth()
  const supabase = createClient()
  const [badges, setBadges] = useState<BadgeItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingBadges, setLoadingBadges] = useState(true)
  const [loadingLeader, setLoadingLeader] = useState(true)

  const fetchBadges = useCallback(async () => {
    if (!user) return
    setLoadingBadges(true)
    const { data: allBadges } = await supabase.from('badges').select('*')
    const { data: earned } = await supabase
      .from('user_badges')
      .select('badge_id, earned_at')
      .eq('user_id', user.id)

    if (allBadges) {
      const earnedIds = new Set(earned?.map((e) => e.badge_id) ?? [])
      const earnedDates = Object.fromEntries(earned?.map((e) => [e.badge_id, e.earned_at]) ?? [])
      setBadges(
        allBadges.map((b) => ({
          ...b,
          earned: earnedIds.has(b.id),
          earned_at: earnedDates[b.id] ?? null,
        }))
      )
    }
    setLoadingBadges(false)
  }, [user, supabase])

  const fetchLeaderboard = useCallback(
    async (tab: LeaderboardTab) => {
      setLoadingLeader(true)

      if (tab === 'alltime') {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, level, xp')
          .order('xp', { ascending: false })
          .limit(20)
        if (data) setLeaderboard(data as LeaderboardEntry[])
        setLoadingLeader(false)
        return
      }

      // Weekly / monthly: somme des xp_log filtres par date
      const sinceDate = new Date()
      if (tab === 'week') sinceDate.setDate(sinceDate.getDate() - 7)
      else sinceDate.setMonth(sinceDate.getMonth() - 1)

      const { data: logs } = await supabase
        .from('xp_log')
        .select('user_id, xp_earned')
        .gte('created_at', sinceDate.toISOString())

      const totals = new Map<string, number>()
      for (const log of (logs ?? []) as { user_id: string; xp_earned: number }[]) {
        totals.set(log.user_id, (totals.get(log.user_id) ?? 0) + (log.xp_earned ?? 0))
      }
      const topIds = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id]) => id)

      if (topIds.length === 0) {
        setLeaderboard([])
        setLoadingLeader(false)
        return
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, level')
        .in('id', topIds)

      const profMap = new Map(
        (
          (profiles ?? []) as {
            id: string
            display_name: string | null
            avatar_url: string | null
            level: number
          }[]
        ).map((p) => [p.id, p])
      )
      const merged: LeaderboardEntry[] = topIds
        .map((id) => {
          const p = profMap.get(id)
          if (!p) return null
          return {
            id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            level: p.level,
            xp: totals.get(id) ?? 0,
          }
        })
        .filter((x): x is LeaderboardEntry => x !== null)

      setLeaderboard(merged)
      setLoadingLeader(false)
    },
    [supabase]
  )

  useEffect(() => {
    fetchBadges()
  }, [fetchBadges])

  return {
    badges,
    leaderboard,
    loadingBadges,
    loadingLeader,
    fetchLeaderboard,
  }
}
