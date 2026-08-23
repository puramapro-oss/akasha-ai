'use client'

import { Users, TrendingUp, Eye, MousePointerClick } from 'lucide-react'
import Card from '@/components/ui/Card'
import { formatNumber } from '@/lib/utils'
import type { AmbassadorStats } from '@/types/ambassador'

interface AmbassadorStatsCardsProps {
  stats: AmbassadorStats
}

export default function AmbassadorStatsCards({ stats }: AmbassadorStatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-[var(--cyan)]" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Clics</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {formatNumber(stats.clicks)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-purple-400" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Inscriptions</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {formatNumber(stats.signups)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <MousePointerClick className="h-5 w-5 text-green-400" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Conversions</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {formatNumber(stats.conversions)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Revenus total</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {stats.revenue.toFixed(2)} €
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
