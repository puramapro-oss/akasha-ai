'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Crown, Medal, Award, Timer, Users, Flame, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn, formatNumber } from '@/lib/utils'

interface ContestEntry {
  user_id: string
  score: number
  rank: number | null
  profile?: { display_name: string | null; avatar_url: string | null; level: number } | null
}

interface ContestData {
  id: string
  type: string
  period: string
  status: string
  pool_amount: number
  start_date: string
  end_date: string
}

const RANK_PRIZES = [
  { rank: 1, pct: '2%', icon: Crown, color: '#f59e0b' },
  { rank: 2, pct: '1%', icon: Medal, color: '#94a3b8' },
  { rank: 3, pct: '0.7%', icon: Medal, color: '#cd7f32' },
  { rank: 4, pct: '0.5%', icon: Award, color: '#00d4ff' },
  { rank: 5, pct: '0.4%', icon: Award, color: '#00d4ff' },
  { rank: 6, pct: '0.3%', icon: Award, color: '#a855f7' },
  { rank: 7, pct: '0.28%', icon: Award, color: '#a855f7' },
  { rank: 8, pct: '0.28%', icon: Award, color: '#a855f7' },
  { rank: 9, pct: '0.27%', icon: Award, color: '#a855f7' },
  { rank: 10, pct: '0.27%', icon: Award, color: '#a855f7' },
]

function getTimeLeft(endDate: string): string {
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return 'Termine'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}j ${hours}h`
  const minutes = Math.floor((diff % 3600000) / 60000)
  return `${hours}h ${minutes}min`
}

export default function ConcoursPage() {
  const { user } = useAuth()
  const [contest, setContest] = useState<ContestData | null>(null)
  const [entries, setEntries] = useState<ContestEntry[]>([])
  const [myEntry, setMyEntry] = useState<ContestEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!user) return

    // Get active weekly contest
    const { data: contestData } = await supabase
      .from('contests')
      .select('*')
      .eq('type', 'weekly')
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (contestData) {
      setContest(contestData as ContestData)

      // Get entries with profiles
      const { data: entriesData } = await supabase
        .from('contest_entries')
        .select('user_id, score, rank')
        .eq('contest_id', contestData.id)
        .order('score', { ascending: false })
        .limit(50)

      if (entriesData) {
        // Fetch profiles for top entries
        const userIds = entriesData.map((e: ContestEntry) => e.user_id)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, level')
          .in('id', userIds)

        const profileMap = new Map(
          (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null; level: number }) => [p.id, p])
        )

        const enriched = entriesData.map((e: ContestEntry, i: number) => ({
          ...e,
          rank: i + 1,
          profile: profileMap.get(e.user_id) ?? null,
        }))
        setEntries(enriched as ContestEntry[])

        const mine = enriched.find((e: ContestEntry) => e.user_id === user.id)
        if (mine) setMyEntry(mine as ContestEntry)
      }
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
          <Trophy className="h-7 w-7 text-[var(--cyan)]" />
          Classement Hebdomadaire
        </h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Top 10 chaque dimanche, 6% du CA redistribue
        </p>
      </div>

      {!contest ? (
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="Aucun concours en cours"
          description="Le prochain classement hebdomadaire debutera bientot"
        />
      ) : (
        <>
          {/* Contest Info */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex items-center gap-3 p-4">
              <Timer className="h-5 w-5 text-[var(--cyan)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Temps restant</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {getTimeLeft(contest.end_date)}
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Cagnotte</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {contest.pool_amount.toFixed(2)} EUR
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Users className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Participants</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {formatNumber(entries.length)}
                </p>
              </div>
            </Card>
          </div>

          {/* My rank */}
          {myEntry && (
            <Card className="border-[var(--cyan)]/20 bg-[var(--cyan)]/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cyan)]/20 text-lg font-bold text-[var(--cyan)]">
                    #{myEntry.rank}
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Ta position</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {formatNumber(myEntry.score)} points
                    </p>
                  </div>
                </div>
                <Flame className="h-6 w-6 text-orange-400" />
              </div>
            </Card>
          )}

          {/* How to score */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Comment gagner des points
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Parrainage', pts: 'x10', color: '#00d4ff' },
                { label: 'Abo converti', pts: 'x50', color: '#a855f7' },
                { label: 'Jour actif', pts: 'x5', color: '#10b981' },
                { label: 'Mission', pts: 'x3', color: '#f59e0b' },
              ].map(({ label, pts, color }) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-lg font-bold" style={{ color }}>{pts}</p>
                  <p className="text-xs text-[var(--text-muted)]">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Leaderboard */}
          <Card className="p-0">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="font-semibold text-[var(--text-primary)]">Classement</h2>
            </div>

            {entries.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                Aucun participant pour le moment
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {entries.slice(0, 10).map((entry, i) => {
                  const isMe = entry.user_id === user?.id
                  const prize = RANK_PRIZES[i]
                  const PrizeIcon = prize?.icon ?? Award

                  return (
                    <div
                      key={entry.user_id}
                      className={cn(
                        'flex items-center gap-4 px-5 py-3 transition-colors',
                        isMe && 'bg-[var(--cyan)]/5',
                        i < 3 && 'bg-white/[0.02]'
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center">
                        {i < 3 ? (
                          <PrizeIcon className="h-5 w-5" style={{ color: prize?.color }} />
                        ) : (
                          <span className="text-sm font-medium text-[var(--text-muted)]">
                            {i + 1}
                          </span>
                        )}
                      </div>

                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-bold text-white">
                        {entry.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'truncate text-sm font-medium',
                          isMe ? 'text-[var(--cyan)]' : 'text-[var(--text-primary)]'
                        )}>
                          {entry.profile?.display_name ?? 'Utilisateur'}
                          {isMe && ' (toi)'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Niv. {entry.profile?.level ?? 1}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                          {formatNumber(entry.score)}
                        </p>
                        {prize && (
                          <Badge variant="default" className="text-[10px]">
                            {prize.pct} CA
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Prize Distribution */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Repartition des gains (6% du CA)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {RANK_PRIZES.slice(0, 5).map(({ rank, pct, color }) => (
                <div key={rank} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-lg font-bold" style={{ color }}>#{rank}</p>
                  <p className="text-sm text-[var(--text-muted)]">{pct}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Positions 6 a 10 : 0.27% a 0.3% chacune. Gains credites automatiquement sur ton wallet.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
