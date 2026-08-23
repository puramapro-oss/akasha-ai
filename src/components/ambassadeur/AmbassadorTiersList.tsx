'use client'

import { Star } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { cn, formatNumber } from '@/lib/utils'
import { AMBASSADOR_TIERS } from '@/constants/ambassador'
import type { AmbassadorTier } from '@/types/ambassador'

interface AmbassadorTiersListProps {
  currentTier: AmbassadorTier
}

export default function AmbassadorTiersList({ currentTier }: AmbassadorTiersListProps) {
  const currentIdx = AMBASSADOR_TIERS.findIndex(t => t.id === currentTier.id)

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
        Paliers Ambassadeur
      </h3>
      <div className="space-y-2">
        {AMBASSADOR_TIERS.map((tier) => {
          const tierIdx = AMBASSADOR_TIERS.findIndex(t => t.id === tier.id)
          const isActive = tier.id === currentTier.id
          const isPassed = tierIdx < currentIdx

          return (
            <div
              key={tier.id}
              className={cn(
                'flex items-center gap-4 rounded-xl border p-4 transition-all',
                isActive
                  ? 'border-[var(--cyan)]/30 bg-[var(--cyan)]/5'
                  : isPassed
                  ? 'border-green-500/20 bg-green-500/5'
                  : 'border-white/[0.06] bg-white/[0.02]'
              )}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${tier.color}20` }}
              >
                <Star className="h-5 w-5" style={{ color: tier.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--text-primary)]">{tier.label}</p>
                  {isActive && <Badge variant="default">Actuel</Badge>}
                  {isPassed && <Badge variant="green">Atteint</Badge>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {tier.min}+ filleuls — {tier.perk}
                </p>
              </div>
              <span className="text-lg font-bold" style={{ color: tier.color }}>
                {formatNumber(tier.prime)} €
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
