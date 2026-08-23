import { Timer, TrendingUp, Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import { formatNumber } from '@/lib/utils'
import { getTimeLeft } from '@/lib/contests/utils'

interface ContestStatsCardsProps {
  endDate: string
  poolAmount: number
  participantCount: number
}

export default function ContestStatsCards({ endDate, poolAmount, participantCount }: ContestStatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="flex items-center gap-3 p-4">
        <Timer className="h-5 w-5 text-[var(--cyan)]" />
        <div>
          <p className="text-xs text-[var(--text-muted)]">Temps restant</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{getTimeLeft(endDate)}</p>
        </div>
      </Card>
      <Card className="flex items-center gap-3 p-4">
        <TrendingUp className="h-5 w-5 text-green-400" />
        <div>
          <p className="text-xs text-[var(--text-muted)]">Cagnotte</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{poolAmount.toFixed(2)} EUR</p>
        </div>
      </Card>
      <Card className="flex items-center gap-3 p-4">
        <Users className="h-5 w-5 text-purple-400" />
        <div>
          <p className="text-xs text-[var(--text-muted)]">Participants</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{formatNumber(participantCount)}</p>
        </div>
      </Card>
    </div>
  )
}
