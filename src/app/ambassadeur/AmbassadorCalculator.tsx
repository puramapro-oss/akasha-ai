'use client'

import { useMemo, useState } from 'react'
import { Users, Wallet, TrendingUp } from 'lucide-react'

type Tier = {
  id: string
  label: string
  min: number
  prime: number
}

type Props = {
  tiers: Tier[]
}

const MONTHLY_ARPU = 22 // revenu mensuel moyen par filleul payant (€/mois) — estimation conservative

function formatEuro(n: number) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

export default function AmbassadorCalculator({ tiers }: Props) {
  const [signups, setSignups] = useState(25)

  // Palier atteint
  const currentTier = useMemo(() => {
    return [...tiers].reverse().find((t) => signups >= t.min) ?? null
  }, [signups, tiers])

  // Commission N1 à vie (50 % ARPU) — sur 12 mois pour projection
  const n1Commission = useMemo(() => Math.round(signups * MONTHLY_ARPU * 0.5 * 12), [signups])

  // Total = prime palier + 12 mois de commissions
  const totalFirstYear = (currentTier?.prime ?? 0) + n1Commission

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
      <label htmlFor="signup-range" className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Users className="h-4 w-4 text-[var(--cyan)]" />
          Nombre de filleuls actifs
        </span>
        <span className="font-display text-lg font-bold tabular-nums text-[var(--text-primary)]">
          {signups}
        </span>
      </label>
      <input
        id="signup-range"
        type="range"
        min={0}
        max={1000}
        step={5}
        value={signups}
        onChange={(e) => setSignups(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--cyan)]"
      />
      <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>0</span>
        <span>250</span>
        <span>500</span>
        <span>1 000</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <Wallet className="mx-auto h-5 w-5 text-amber-400" />
          <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Prime palier</p>
          <p className="mt-1 font-display text-xl font-bold">
            {currentTier ? `${formatEuro(currentTier.prime)} €` : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {currentTier?.label ?? 'Aucun palier atteint'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <TrendingUp className="mx-auto h-5 w-5 text-[var(--cyan)]" />
          <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Commissions N1 / 12 mois</p>
          <p className="mt-1 font-display text-xl font-bold">{formatEuro(n1Commission)} €</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">50 % × ARPU ×12</p>
        </div>
        <div className="rounded-xl border border-[var(--cyan)]/30 bg-[var(--cyan)]/5 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wider text-[var(--cyan)]">Total 1ʳᵉ année</p>
          <p className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">
            {formatEuro(totalFirstYear)} €
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">estimé — hors N2 + N3</p>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Estimation indicative à partir d&apos;un ARPU de 22 €/mois et d&apos;un taux de rétention constant.
        Les commissions sont versées après 30 jours d&apos;activité réelle du filleul.
      </p>
    </div>
  )
}
