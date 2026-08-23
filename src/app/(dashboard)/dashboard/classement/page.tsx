'use client'

import { useEffect, useState } from 'react'
import { Medal, Crown, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import Badge from '@/components/ui/Badge'
import { cn, getInitials } from '@/lib/utils'

interface LeaderboardEntry {
  id: string
  display_name: string | null
  avatar_url: string | null
  xp: number
  level: number
  streak_count: number
}

const RANK_ICONS = [Crown, Medal, Medal]
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']

export default function ClassementPage() {
  const { user } = useAuth()
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userRank, setUserRank] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, xp, level, streak_count')
        .order('xp', { ascending: false })
        .limit(50)

      if (data) {
        setLeaders(data as LeaderboardEntry[])
        if (user) {
          const idx = data.findIndex(d => d.id === user.id)
          setUserRank(idx >= 0 ? idx + 1 : null)
        }
      }
      setLoading(false)
    }
    load()
  }, [supabase, user])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Classement</h1>
          <p className="mt-1 text-[var(--text-secondary)]">Top utilisateurs par XP</p>
        </div>
        {userRank && (
          <Badge variant="default" className="text-base px-4 py-2">
            Ta position : #{userRank}
          </Badge>
        )}
      </div>

      {/* Top 3 podium */}
      {leaders.length >= 3 && (
        <div className="grid grid-cols-3 gap-4">
          {[1, 0, 2].map(idx => {
            const entry = leaders[idx]
            const RankIcon = RANK_ICONS[idx]
            return (
              <Card
                key={entry.id}
                className={cn(
                  'flex flex-col items-center p-4',
                  idx === 0 && 'md:-mt-4'
                )}
              >
                <RankIcon className="h-8 w-8" style={{ color: RANK_COLORS[idx] }} />
                <div className="mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-lg font-bold text-white">
                  {getInitials(entry.display_name)}
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)] truncate max-w-full">
                  {entry.display_name ?? 'Anonyme'}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">Niv. {entry.level}</p>
                <p className="mt-1 font-bold text-[var(--cyan)]">{entry.xp.toLocaleString('fr-FR')} XP</p>
              </Card>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <Card className="divide-y divide-[var(--border)]/50 overflow-hidden">
        {leaders.map((entry, i) => (
          <div
            key={entry.id}
            className={cn(
              'flex items-center gap-4 px-4 py-3',
              entry.id === user?.id && 'bg-[var(--cyan)]/5'
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold text-[var(--text-secondary)]">
              {i + 1}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)]/20 to-[var(--purple)]/20 text-sm font-bold text-[var(--text-primary)]">
              {getInitials(entry.display_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[var(--text-primary)]">
                {entry.display_name ?? 'Anonyme'}
                {entry.id === user?.id && <span className="ml-2 text-[var(--cyan)]">(toi)</span>}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">Niv. {entry.level}</p>
            </div>
            <div className="flex items-center gap-3 text-right">
              {entry.streak_count > 0 && (
                <div className="flex items-center gap-1 text-orange-400">
                  <Flame className="h-4 w-4" />
                  <span className="text-sm">{entry.streak_count}</span>
                </div>
              )}
              <div>
                <p className="font-bold text-[var(--text-primary)]">{entry.xp.toLocaleString('fr-FR')}</p>
                <p className="text-xs text-[var(--text-secondary)]">XP</p>
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
