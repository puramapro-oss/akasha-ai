import Link from 'next/link'
import { ArrowLeft, ArrowRight, Crown, Sparkles, Users, Wallet } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import AmbassadorCalculator from './AmbassadorCalculator'

export const metadata = {
  title: 'Programme Ambassadeur — AKASHA AI',
  description:
    'Deviens Ambassadeur AKASHA : 9 paliers de primes (Bronze 200 € → Éternel 200 000 €) + commissions à vie 50 % / 15 % / 7 %.',
}

// V7 SUPREME — 9 paliers Bronze 200 € → Éternel 200 000 €
const TIERS = [
  { id: 'bronze',  label: 'Bronze',  min: 10,    prime: 200,    perk: 'Kit ambassadeur + badge' },
  { id: 'argent',  label: 'Argent',  min: 25,    prime: 500,    perk: 'Early access + page perso' },
  { id: 'or',      label: 'Or',      min: 50,    prime: 1000,   perk: 'Plan offert + page publique' },
  { id: 'platine', label: 'Platine', min: 100,   prime: 2500,   perk: 'Priorité features + événements' },
  { id: 'diamant', label: 'Diamant', min: 250,   prime: 6000,   perk: 'Accès VIP + coach dédié' },
  { id: 'legende', label: 'Légende', min: 500,   prime: 12000,  perk: 'Commissions héréditaires' },
  { id: 'titan',   label: 'Titan',   min: 1000,  prime: 25000,  perk: 'Ligne directe + beta' },
  { id: 'dieu',    label: 'Dieu',    min: 5000,  prime: 100000, perk: 'Parts ecosystème' },
  { id: 'eternel', label: 'Éternel', min: 10000, prime: 200000, perk: '1 % parts + transmissible' },
]

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  argent: '#94a3b8',
  or: '#f59e0b',
  platine: '#a855f7',
  diamant: '#06b6d4',
  legende: '#f43f5e',
  titan: '#8b5cf6',
  dieu: '#eab308',
  eternel: '#fbbf24',
}

function formatNumber(n: number) {
  return n.toLocaleString('fr-FR')
}

export default async function AmbassadeurPublicPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ctaHref = user ? '/dashboard/ambassadeur' : '/signup?next=/dashboard/ambassadeur'
  const ctaLabel = user ? 'Accéder à mon dashboard' : 'Postuler comme Ambassadeur'

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-amber-500/15 via-[var(--cyan)]/10 to-transparent blur-3xl" />
      </div>

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          AKASHA
        </Link>
        {!user && (
          <Link
            href="/login"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08]"
          >
            Connexion
          </Link>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-6 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-xs font-medium text-amber-300">
          <Crown className="h-3.5 w-3.5" />
          Programme Ambassadeur — 9 paliers
        </div>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          Gagne jusqu&apos;à{' '}
          <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-rose-500 bg-clip-text text-transparent">
            200 000 €
          </span>{' '}
          en partageant AKASHA
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Primes cumulables selon ton palier <strong className="text-[var(--text-primary)]">plus</strong> commissions à vie sur les abonnements de tes filleuls : 50 % niveau 1, 15 % niveau 2, 7 % niveau 3.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={ctaHref}
            data-testid="ambassadeur-cta-primary"
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-12px_rgba(251,191,36,0.6)] transition-all hover:brightness-110"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#paliers"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.06]"
          >
            Voir les paliers
          </a>
        </div>
      </section>

      {/* KPIs */}
      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-6 pb-12 sm:grid-cols-3">
        {[
          { icon: Users, label: '9 paliers', value: 'Bronze → Éternel' },
          { icon: Wallet, label: 'Primes one-shot', value: '200 € → 200 000 €' },
          { icon: Sparkles, label: 'Commissions à vie', value: '50 % / 15 % / 7 %' },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center"
          >
            <Icon className="mx-auto h-6 w-6 text-[var(--cyan)]" />
            <p className="mt-2 font-display text-lg font-bold text-[var(--text-primary)]">{value}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{label}</p>
          </div>
        ))}
      </section>

      {/* Calculateur interactif */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="mb-6 text-center font-display text-2xl font-bold sm:text-3xl">
          Simule tes gains
        </h2>
        <AmbassadorCalculator tiers={TIERS} />
      </section>

      {/* Paliers */}
      <section id="paliers" className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="mb-8 text-center font-display text-2xl font-bold sm:text-3xl">
          Les 9 paliers
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((tier) => {
            const color = TIER_COLORS[tier.id]
            return (
              <div
                key={tier.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/20"
                style={{ boxShadow: `0 0 20px -10px ${color}40` }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {tier.label}
                  </span>
                  <span className="font-display text-xl font-bold tabular-nums" style={{ color }}>
                    {formatNumber(tier.prime)} €
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--text-primary)]">
                  <span className="font-semibold">{tier.min}</span> filleuls minimum
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {tier.perk}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Commissions à vie */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--cyan)]/10 via-transparent to-[var(--purple)]/10 p-8 text-center sm:p-12">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">
            En plus des paliers, des commissions à vie
          </h2>
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-4">
            {[
              { level: 'N1', pct: '50 %', desc: 'Filleul direct' },
              { level: 'N2', pct: '15 %', desc: 'Filleul de filleul' },
              { level: 'N3', pct: '7 %', desc: 'Niveau 3' },
            ].map(({ level, pct, desc }) => (
              <div key={level} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cyan)]">{level}</p>
                <p className="mt-2 font-display text-3xl font-bold">{pct}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-xs text-[var(--text-muted)]">
            Commission versée chaque mois après 30 jours d&apos;activité réelle du filleul. Paiement wallet Purama, retrait dès 5 €.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          Prêt à devenir Ambassadeur ?
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-[var(--text-secondary)]">
          Inscription en 1 clic. Ton lien personnalisé est généré automatiquement.
        </p>
        <Link
          href={ctaHref}
          data-testid="ambassadeur-cta-footer"
          className="group mx-auto mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-12px_rgba(251,191,36,0.6)] transition-all hover:brightness-110"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>
    </main>
  )
}
