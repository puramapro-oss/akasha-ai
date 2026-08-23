'use client'

import { Trophy } from 'lucide-react'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { formatNumber, getInitials, cn } from '@/lib/utils'
import type { LeaderboardEntry, LeaderboardTab } from '@/types/xp'

interface XPLeaderboardProps {
  leaderboard: LeaderboardEntry[]
  loading: boolean
  activeTab: LeaderboardTab
  userId?: string
  onTabChange: (tab: LeaderboardTab) => void
}

export default function XPLeaderboard({
  leaderboard,
  loading,
  activeTab,
  userId,
  onTabChange,
}: XPLeaderboardProps) {
  return (
    <section data-testid="leaderboard-section">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Classement
      </h2>
      <Card className="overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {(
            [
              ['alltime', 'All-time'],
              ['month', 'Ce mois'],
              ['week', 'Cette semaine'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              data-testid={`leaderboard-tab-${tab}`}
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-[var(--cyan)] text-[var(--cyan)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
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
              const isMe = entry.id === userId
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
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        isMe ? 'text-[var(--cyan)]' : 'text-[var(--text-primary)]'
                      )}
                    >
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
  )
}
