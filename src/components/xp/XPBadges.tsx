'use client'

import { Lock, Trophy } from 'lucide-react'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { BadgeItem } from '@/types/xp'

interface XPBadgesProps {
  badges: BadgeItem[]
  loading: boolean
}

export default function XPBadges({ badges, loading }: XPBadgesProps) {
  return (
    <section data-testid="badges-section">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Badges
      </h2>
      {loading ? (
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
  )
}
