'use client'

import { useState, useCallback } from 'react'
import { Trophy, Award, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn, formatNumber } from '@/lib/utils'
import { RANK_PRIZES } from '@/lib/contests/utils'
import ContestStatsCards from '@/components/contests/ContestStatsCards'
import HowToScoreCard from '@/components/contests/HowToScoreCard'
import PrizeDistributionCard from '@/components/contests/PrizeDistributionCard'

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

export default function ConcoursPage() {
  const auth = useAuth()
  return <ConcoursPageContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function ConcoursPageContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { user } = auth
  const [supabase] = useState(createClient)

  const userId = user?.id
  const readContest = useCallback(async (signal: AbortSignal) => {
    const { data: contestData, error } = await supabase.from('contests').select('*')
      .eq('type', 'weekly').eq('status', 'active').order('start_date', { ascending: false })
      .limit(1).abortSignal(signal).maybeSingle()
    if (error) throw new Error('Impossible de charger le concours')
    if (!contestData) return { contest: null, entries: [], myEntry: null }
    const { data: entriesData, error: entriesError } = await supabase.from('contest_entries')
      .select('user_id, score, rank').eq('contest_id', contestData.id)
      .order('score', { ascending: false }).limit(50).abortSignal(signal)
    if (entriesError) throw new Error('Impossible de charger le classement')
    const { data: profiles, error: profilesError } = await supabase.from('profiles')
      .select('id, display_name, avatar_url, level')
      .in('id', (entriesData ?? []).map((entry: ContestEntry) => entry.user_id)).abortSignal(signal)
    if (profilesError) throw new Error('Impossible de charger les profils du classement')
    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
    const entries = (entriesData ?? []).map((entry: ContestEntry, index: number) => ({
      ...entry, rank: index + 1, profile: profileMap.get(entry.user_id) ?? null,
    })) as ContestEntry[]
    return { contest: contestData as ContestData, entries, myEntry: entries.find(entry => entry.user_id === userId) ?? null }
  }, [userId, supabase])
  const { data: { contest, entries, myEntry }, loading, error, refetch } =
    useAsyncResource<{ contest: ContestData | null; entries: ContestEntry[]; myEntry: ContestEntry | null }>(
      userId ?? null, readContest, { contest: null, entries: [], myEntry: null })

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) return <div role="alert">Impossible de charger les données. <button onClick={() => void refetch()}>Réessayer</button></div>

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
          <ContestStatsCards
            endDate={contest.end_date}
            poolAmount={contest.pool_amount}
            participantCount={entries.length}
          />

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
          <HowToScoreCard />

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
          <PrizeDistributionCard />
        </>
      )}
    </div>
  )
}
