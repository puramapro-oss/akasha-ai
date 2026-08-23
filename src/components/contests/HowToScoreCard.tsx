import Card from '@/components/ui/Card'
import { SCORE_MULTIPLIERS } from '@/lib/contests/utils'

export default function HowToScoreCard() {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Comment gagner des points</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SCORE_MULTIPLIERS.map(({ label, pts, color }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
            <p className="text-lg font-bold" style={{ color }}>
              {pts}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
