import Card from '@/components/ui/Card'
import { RANK_PRIZES } from '@/lib/contests/utils'

export default function PrizeDistributionCard() {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Repartition des gains (6% du CA)
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {RANK_PRIZES.slice(0, 5).map(({ rank, pct, color }) => (
          <div key={rank} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
            <p className="text-lg font-bold" style={{ color }}>
              #{rank}
            </p>
            <p className="text-sm text-[var(--text-muted)]">{pct}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Positions 6 a 10 : 0.27% a 0.3% chacune. Gains credites automatiquement sur ton wallet.
      </p>
    </Card>
  )
}
