'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Wallet, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react'
import Confetti from '@/components/shared/Confetti'

type Summary = {
  amountTotal: number
  currency: string
  planLabel: string
  couponApplied: string | null
  couponPercent: number | null
} | null

export default function ConfirmationClient({ summary }: { summary: Summary }) {
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(true), 120)
    return () => clearTimeout(t)
  }, [])

  const euros = summary
    ? (summary.amountTotal / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null
  const hasPromo = !!summary?.couponApplied

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-base)] px-6 py-10 text-[var(--text-primary)]">
      <Confetti active={showConfetti} duration={4500} />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[var(--cyan)]/15 via-transparent to-transparent" />
      </div>

      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] shadow-[0_0_30px_-5px_rgba(0,212,255,0.6)]">
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>

          <h1 className="mt-6 text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Bienvenue dans AKASHA ✨
          </h1>

          <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
            Ton abonnement est actif. Ton accès immédiat a démarré et ta prime est en route.
          </p>

          {/* Résumé transaction */}
          {summary && euros && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
              <span className="text-[var(--text-muted)] capitalize">{summary.planLabel.trim() || 'Abonnement'}</span>
              <div className="flex items-center gap-2">
                {hasPromo && summary.couponPercent && (
                  <span className="rounded-full bg-[var(--cyan)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--cyan)]">
                    -{summary.couponPercent} %
                  </span>
                )}
                <span className="font-semibold tabular-nums">{euros} €</span>
              </div>
            </div>
          )}

          {/* Prime J+1 — carte principale */}
          <div className="mt-5 rounded-2xl border border-[var(--cyan)]/30 bg-gradient-to-br from-[var(--cyan)]/10 to-[var(--purple)]/10 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--cyan)]/20">
                <Wallet className="h-5 w-5 text-[var(--cyan)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-[var(--text-primary)]">Prime J+1 : 25 €</h2>
                  <Sparkles className="h-4 w-4 text-[var(--cyan)]" />
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  Créditée sur ton wallet Purama dans les prochaines minutes.
                  Les tranches 2 &amp; 3 suivront à M+1 et M+2 (100 € au total).
                </p>
              </div>
            </div>
          </div>

          {/* Étapes suivantes */}
          <div className="mt-6 space-y-2.5 text-sm text-[var(--text-secondary)]">
            {[
              { icon: Trophy, text: 'Ton streak démarre aujourd\u2019hui — ne le casse pas !' },
              { icon: Sparkles, text: 'Invite 1 ami : +25 € pour toi, +20 € pour lui.' },
              { icon: Wallet, text: 'Retrait wallet disponible après 30 jours d\u2019abonnement actif.' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <Icon className="h-4 w-4 flex-shrink-0 text-[var(--cyan)]" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <Link
            href="/dashboard"
            className="group mt-7 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-12px_rgba(0,212,255,0.6)] transition-all hover:brightness-110"
          >
            Accéder à mon dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
            En activant ton accès immédiat, tu renonces à ton droit de rétractation de 14 jours
            conformément à l&apos;art. L221-28 3° du Code de la consommation.
            Prime créditée en wallet — retrait conditionné à 30 jours d&apos;abonnement actif.
          </p>
        </div>
      </div>
    </main>
  )
}
