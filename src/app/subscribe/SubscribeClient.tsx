'use client'

import { useState } from 'react'
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Plan, PlanTier } from '@/types'

type Offer = {
  plan: Exclude<Plan, 'free'>
  tier: PlanTier
  label: string
  tagline: string
  features: string[]
  highlight?: boolean
  priceOriginal: string
  priceFinal: string
}

type Promo = {
  coupon: string
  source: string
  set_at: number
} | null

export default function SubscribeClient({ offers, promo }: { offers: Offer[]; promo: Promo }) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const startCheckout = async (offer: Offer) => {
    const key = `${offer.plan}-${offer.tier}`
    setLoadingKey(key)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: offer.plan, tier: offer.tier }),
      })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        toast.error(json.error ?? 'Impossible de démarrer le paiement. Réessaie dans un instant.')
        setLoadingKey(null)
        return
      }
      window.location.assign(json.url)
    } catch {
      toast.error('Erreur réseau. Vérifie ta connexion et réessaie.')
      setLoadingKey(null)
    }
  }

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-3">
      {offers.map((offer) => {
        const key = `${offer.plan}-${offer.tier}`
        const isLoading = loadingKey === key
        const hasDiscount = promo?.coupon === 'WELCOME50'
        return (
          <div
            key={key}
            className={[
              'relative flex flex-col rounded-2xl border bg-white/[0.02] p-6 text-left backdrop-blur-xl transition-all',
              offer.highlight
                ? 'border-[var(--cyan)]/50 shadow-[0_0_40px_-10px_rgba(0,212,255,0.4)]'
                : 'border-white/[0.08] hover:border-white/[0.16]',
            ].join(' ')}
          >
            {offer.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Populaire
              </span>
            )}

            <div>
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">{offer.label}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{offer.tagline}</p>
            </div>

            <div className="mt-5 flex items-baseline gap-2">
              {hasDiscount && (
                <span className="text-sm text-[var(--text-muted)] line-through decoration-red-400/60 decoration-[1.5px]">
                  {offer.priceOriginal} €
                </span>
              )}
              <span className="font-display text-3xl font-bold text-[var(--text-primary)]">
                {offer.priceFinal} €
              </span>
              <span className="text-xs text-[var(--text-muted)]">/mois</span>
            </div>
            {hasDiscount && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[var(--cyan)]">
                <Sparkles className="h-3 w-3" />
                -50 % le 1ᵉʳ mois (code auto-appliqué)
              </p>
            )}

            <ul className="mt-5 space-y-2 text-sm">
              {offer.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--cyan)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => startCheckout(offer)}
              disabled={isLoading || loadingKey !== null}
              className={[
                'group mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
                offer.highlight
                  ? 'bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white shadow-[0_8px_30px_-10px_rgba(0,212,255,0.6)] hover:brightness-110'
                  : 'border border-white/15 bg-white/[0.04] text-[var(--text-primary)] hover:bg-white/[0.08]',
              ].join(' ')}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirection…
                </>
              ) : (
                <>
                  Démarrer &amp; recevoir ma prime
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
