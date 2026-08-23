'use client'

import Card from '@/components/ui/Card'
import { formatNumber } from '@/lib/utils'

interface XPStatsProps {
  xp: number
  level: number
  userRank: number
}

export default function XPStats({ xp, level, userRank }: XPStatsProps) {
  return (
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
  )
}
