'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, Lock, Trophy, Zap, MessageSquare, Image, Video, Music, Bot, Globe, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { XP_ACTIONS, XP_TITLES } from '@/lib/constants'
import { formatNumber, getInitials, cn } from '@/lib/utils'

interface BadgeItem {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  xp_reward: number
  condition_type: string | null
  condition_value: number | null
  earned?: boolean
  earned_at?: string | null
}

interface LeaderboardEntry {
  id: string
  display_name: string | null
  avatar_url: string | null
  level: number
  xp: number
}

type LeaderboardTab = 'alltime' | 'month' | 'week'

const XP_ACTION_ICONS: Record<string, React.ReactNode> = {
  daily_login: <Zap className="h-4 w-4" />,
  chat_message: <MessageSquare className="h-4 w-4" />,
  generate_image: <Image className="h-4 w-4" />,
  generate_video: <Video className="h-4 w-4" />,
  generate_music: <Music className="h-4 w-4" />,
  create_agent: <Bot className="h-4 w-4" />,
  publish_agent: <Globe className="h-4 w-4" />,
  arena_vote: <CheckCircle className="h-4 w-4" />,
  complete_workflow: <CheckCircle className="h-4 w-4" />,
  invite_friend: <Globe className="h-4 w-4" />,
  streak_7: <Zap className="h-4 w-4" />,
  streak_30: <Zap className="h-4 w-4" />,
}

const XP_ACTION_LABELS: Record<string, string> = {
  daily_login: 'Connexion quotidienne',
  chat_message: 'Envoyer un message IA',
  generate_image: 'Generer une image',
  generate_video: 'Generer une video',
  generate_music: 'Generer de la musique',
  create_agent: 'Creer un agent',
  publish_agent: 'Publier un agent',
  arena_vote: 'Voter dans l\'arena',
  complete_workflow: 'Completer un workflow',
  invite_friend: 'Inviter un ami',
  streak_7: 'Serie de 7 jours',
  streak_30: 'Serie de 30 jours',
}

function getXPTitle(level: number): string {
  const found = XP_TITLES.find((t) => level >= t.min && level <= t.max)
  return found?.title ?? 'Explorateur'
}

function getXPForNextLevel(level: number): number {
  return (level + 1) * 500
}

export default function XPPage() {
  const { user, profile } = useAuth()
  const [badges, setBadges] = useState<BadgeItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingBadges, setLoadingBadges] = useState(true)
  const [loadingLeader, setLoadingLeader] = useState(true)
  const [leaderTab, setLeaderTab] = useState<LeaderboardTab>('alltime')

  const supabase = createClient()

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

  const fetchLeaderboard = useCallback(async (tab: LeaderboardTab) => {
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
      ((profiles ?? []) as { id: string; display_name: string | null; avatar_url: string | null; level: number }[]).map((p) => [p.id, p])
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
  }, [supabase])

  useEffect(() => {
    fetchBadges()
  }, [fetchBadges])

  useEffect(() => {
    fetchLeaderboard(leaderTab)
  }, [fetchLeaderboard, leaderTab])

  const level = profile?.level ?? 1
  const xp = profile?.xp ?? 0
  const nextLevelXP = getXPForNextLevel(level)
  const progress = Math.min((xp / nextLevelXP) * 100, 100)
  const title = getXPTitle(level)

  const userRank = leaderboard.findIndex((e) => e.id === user?.id) + 1

  return (
    <div className="flex flex-col gap-6" data-testid="xp-page">
      {/* Header Profile */}
      <Card className="p-6" data-testid="xp-profile-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xl font-bold text-white">
            {getInitials(profile?.display_name ?? null)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                {profile?.display_name ?? 'Utilisateur'}
              </h1>
              <Badge variant="cyan">{title}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Niveau {level} &bull; {formatNumber(xp)} XP
            </p>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                <span>{formatNumber(xp)} XP</span>
                <span>{formatNumber(nextLevelXP)} XP pour niv. {level + 1}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* XP Stats */}
      <div className="grid grid-cols-3 gap-3" data-testid="xp-stats">
        <Card className="flex flex-col items-center gap-1 p-4 text-center">
          <p className="text-2xl font-bold gradient-text">{formatNumber(xp)}</p>
          <p className="text-xs text-[var(--text-muted)]">XP Total</p>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--cyan)]">{level}</p>
          <p className="text-xs text-[var(--text-muted)]">Niveau</p>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">
            {userRank > 0 ? `#${userRank}` : '—'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Classement</p>
        </Card>
      </div>

      {/* How to earn XP */}
      <section data-testid="xp-actions-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Comment gagner des XP
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(XP_ACTIONS).map(([key, value]) => (
            <Card key={key} className="flex items-center gap-3 p-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--cyan)]/10 text-[var(--cyan)]">
                {XP_ACTION_ICONS[key] ?? <Star className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {XP_ACTION_LABELS[key] ?? key}
                </p>
              </div>
              <Badge variant="gold">+{value} XP</Badge>
            </Card>
          ))}
        </div>
      </section>

      {/* Badges */}
      <section data-testid="badges-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Badges
        </h2>
        {loadingBadges ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : badges.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-10 w-10" />}
            title="Aucun badge disponible"
            description="Aucun badge disponible pour le moment."
          />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {badges.map((badge) => (
              <Card
                key={badge.id}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 text-center transition-all',
                  !badge.earned && 'opacity-40 grayscale'
                )}
                data-testid={`badge-${badge.id}`}
              >
                <div className="relative text-3xl">
                  {badge.icon ?? '🏅'}
                  {!badge.earned && (
                    <Lock className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  )}
                </div>
                <p className="text-xs font-medium text-[var(--text-primary)] leading-tight">
                  {badge.name}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Leaderboard */}
      <section data-testid="leaderboard-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Classement
        </h2>
        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {([['alltime', 'All-time'], ['month', 'Ce mois'], ['week', 'Cette semaine']] as const).map(
              ([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setLeaderTab(tab)}
                  data-testid={`leaderboard-tab-${tab}`}
                  className={cn(
                    'flex-1 py-3 text-sm font-medium transition-colors',
                    leaderTab === tab
                      ? 'border-b-2 border-[var(--cyan)] text-[var(--cyan)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {label}
                </button>
              )
            )}
          </div>

          {loadingLeader ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-8 w-8" />}
              title="Aucune donnee"
              description="Sois le premier a apparaitre dans le classement !"
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {leaderboard.map((entry, idx) => {
                const rank = idx + 1
                const isMe = entry.id === user?.id
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3',
                      isMe && 'bg-[var(--cyan)]/5'
                    )}
                    data-testid={`leaderboard-row-${rank}`}
                  >
                    <span
                      className={cn(
                        'w-6 text-center text-sm font-bold',
                        rank === 1 && 'text-[var(--gold)]',
                        rank === 2 && 'text-gray-300',
                        rank === 3 && 'text-amber-600',
                        rank > 3 && 'text-[var(--text-muted)]'
                      )}
                    >
                      {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                    </span>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-bold text-black">
                      {getInitials(entry.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isMe ? 'text-[var(--cyan)]' : 'text-[var(--text-primary)]')}>
                        {entry.display_name ?? 'Utilisateur'}
                        {isMe && ' (toi)'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Niveau {entry.level}</p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--gold)]">
                      {formatNumber(entry.xp)} XP
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
