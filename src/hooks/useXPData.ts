import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from './useAsyncResource'
import type { BadgeItem, LeaderboardEntry, LeaderboardTab } from '@/types/xp'

export function useXPData(leaderTab: LeaderboardTab = 'alltime') {
  const { user } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const loadBadges = useCallback(async (signal: AbortSignal): Promise<BadgeItem[]> => {
    const [all, earned] = await Promise.all([
      supabase.from('badges').select('*').abortSignal(signal),
      supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', userId!).abortSignal(signal),
    ])
    if (all.error || earned.error) throw new Error('Impossible de charger les badges.')
    const dates = new Map((earned.data ?? []).map(row => [row.badge_id, row.earned_at]))
    return ((all.data ?? []) as BadgeItem[]).map(badge => ({
      ...badge, earned: dates.has(badge.id), earned_at: dates.get(badge.id) ?? null,
    }))
  }, [userId, supabase])
  const loadLeaderboard = useCallback(async (signal: AbortSignal): Promise<LeaderboardEntry[]> => {
    if (leaderTab === 'alltime') {
      const { data, error } = await supabase.from('profiles')
        .select('id, display_name, avatar_url, level, xp').order('xp', { ascending: false }).limit(20).abortSignal(signal)
      if (error) throw new Error('Impossible de charger le classement.')
      return (data ?? []) as LeaderboardEntry[]
    }
    const sinceDate = new Date()
    if (leaderTab === 'week') sinceDate.setDate(sinceDate.getDate() - 7)
    else sinceDate.setMonth(sinceDate.getMonth() - 1)
    const { data: logs, error } = await supabase.from('xp_log').select('user_id, xp_earned')
      .gte('created_at', sinceDate.toISOString()).abortSignal(signal)
    if (error) throw new Error('Impossible de charger le classement.')
    const totals = new Map<string, number>()
    for (const log of (logs ?? []) as { user_id: string; xp_earned: number }[]) {
      totals.set(log.user_id, (totals.get(log.user_id) ?? 0) + (log.xp_earned ?? 0))
    }
    const topIds = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id)
    if (!topIds.length) return []
    const profiles = await supabase.from('profiles').select('id, display_name, avatar_url, level')
      .in('id', topIds).abortSignal(signal)
    if (profiles.error) throw new Error('Impossible de charger le classement.')
    const byId = new Map(((profiles.data ?? []) as Omit<LeaderboardEntry, 'xp'>[]).map(profile => [profile.id, profile]))
    return topIds.flatMap(id => {
      const profile = byId.get(id)
      return profile ? [{ ...profile, xp: totals.get(id) ?? 0 }] : []
    })
  }, [leaderTab, supabase])
  const badges = useAsyncResource(userId ?? null, loadBadges, [] as BadgeItem[])
  const leaderboard = useAsyncResource(userId ? userId + ':' + leaderTab : null, loadLeaderboard, [] as LeaderboardEntry[])
  return {
    badges: badges.data, leaderboard: leaderboard.data, loadingBadges: badges.loading, loadingLeader: leaderboard.loading,
    error: badges.error ?? leaderboard.error, fetchLeaderboard: leaderboard.refetch,
  }
}
