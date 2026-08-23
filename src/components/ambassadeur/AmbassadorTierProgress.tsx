'use client'

import { Crown } from 'lucide-react'
import Card from '@/components/ui/Card'
import { formatNumber } from '@/lib/utils'
import type { AmbassadorTier, AmbassadorStats } from '@/types/ambassador'

interface AmbassadorTierProgressProps {
  currentTier: AmbassadorTier
  nextTier: AmbassadorTier | null
  stats: AmbassadorStats
}

export default function AmbassadorTierProgress({
  currentTier,
  nextTier,
  stats,
}: AmbassadorTierProgressProps) {
  if (!nextTier) return null

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5" style={{ color: currentTier.color }} />
          <span className="text-sm text-[var(--text-primary)]">
            {currentTier.label} → {nextTier.label}
          </span>
        </div>
        <span className="text-sm text-[var(--text-muted)]">
          {stats.signups}/{nextTier.min} filleuls — prime {formatNumber(nextTier.prime)} €
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, (stats.signups / nextTier.min) * 100)}%`,
            backgroundColor: nextTier.color,
          }}
        />
      </div>
    </Card>
  )
}
