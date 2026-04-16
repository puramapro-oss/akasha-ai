import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { STRIPE_PLANS } from '@/lib/stripe'
import SubscribeClient from './SubscribeClient'
import type { Plan, PlanTier } from '@/types'

type PuramaPromo = {
  coupon: string
  source: string
  set_at: number
}

function parsePromoCookie(raw: string | undefined): PuramaPromo | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'coupon' in parsed &&
      typeof (parsed as { coupon: unknown }).coupon === 'string'
    ) {
      return parsed as PuramaPromo
    }
  } catch {
    /* cookie non JSON */
  }
  return null
}

const SUBSCRIBE_PLANS: Array<{
  plan: Exclude<Plan, 'free'>
  tier: PlanTier
  label: string
  tagline: string
  features: string[]
  highlight?: boolean
}> = [
  {
    plan: 'automate',
    tier: 'essential',
    label: 'Automate Essential',
    tagline: 'Workflows IA no-code',
    features: ['1 workflow IA actif', '1 000 runs / mois', 'Modèles classiques'],
  },
  {
    plan: 'complete',
    tier: 'essential',
    label: 'Complete Essential',
    tagline: 'Tout AKASHA, un seul abonnement',
    features: ['Chat + Studio + Agents', 'Génération image/vidéo/audio', 'Marketplace inclus'],
    highlight: true,
  },
  {
    plan: 'create',
    tier: 'pro',
    label: 'Create Pro',
    tagline: 'Pour les créateurs ambitieux',
    features: ['Studio vidéo avancé', '4K / vidéos longues', 'Modèles image premium'],
  },
]

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function SubscribePage() {
  // Auth requise — middleware redirige déjà, mais double-check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?next=/subscribe')
  }

  const cookieStore = await cookies()
  const promo = parsePromoCookie(cookieStore.get('purama_promo')?.value)

  const offers = SUBSCRIBE_PLANS.map((p) => {
    const monthlyCents = STRIPE_PLANS[p.plan][p.tier].monthly
    const discountedCents = promo?.coupon === 'WELCOME50'
      ? Math.round(monthlyCents / 2)
      : monthlyCents
    return {
      ...p,
      priceOriginal: formatEuros(monthlyCents),
      priceFinal: formatEuros(discountedCents),
    }
  })

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-20%] left-[-10%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-[var(--cyan)]/20 to-transparent blur-3xl" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[460px] w-[460px] rounded-full bg-gradient-to-br from-[var(--purple)]/20 to-transparent blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
        <span className="font-display text-sm font-semibold tracking-tight">AKASHA AI</span>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-6 text-center">
        {promo?.coupon === 'WELCOME50' && (
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--cyan)]/40 bg-[var(--cyan)]/10 px-4 py-1.5 text-sm font-medium text-[var(--cyan)]">
            <Sparkles className="h-3.5 w-3.5" />
            Ta prime de bienvenue t&apos;attend — créditée sur ton compte Purama dès aujourd&apos;hui.
          </div>
        )}

        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Choisis ton plan AKASHA
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--text-muted)] sm:text-base">
          Un seul abonnement, tous les outils IA. Annulable à tout moment.
        </p>

        <SubscribeClient offers={offers} promo={promo} />

        <p className="mx-auto mt-10 max-w-xl text-[11px] leading-relaxed text-[var(--text-muted)]">
          En démarrant maintenant, tu bénéficies d&apos;un accès immédiat à ton abonnement (art. L221-28 Code conso).
          La prime de bienvenue est créditée sur ton wallet Purama en 3 tranches (J+0, M+1, M+2).
          Retrait possible après 30 jours d&apos;abonnement actif.
        </p>
      </section>
    </main>
  )
}
