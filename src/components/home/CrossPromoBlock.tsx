'use client'

// =============================================================================
// AKASHA AI — CrossPromoBlock
// Bloc de cross-promotion vers une autre app Purama
// =============================================================================

import { Sparkles, ArrowRight } from 'lucide-react';
import type { CrossPromoApp } from './home-types';

interface CrossPromoBlockProps {
  promo: CrossPromoApp;
}

export default function CrossPromoBlock({ promo }: CrossPromoBlockProps) {
  const PromoIcon = promo.icon;

  return (
    <a
      href={promo.url}
      data-testid="home-cross-promo"
      rel="noopener"
      className="card group relative overflow-hidden p-5 transition-all hover:border-[var(--purple)]/30"
    >
      <div
        className={`absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br ${promo.gradient} opacity-30 blur-2xl`}
      />

      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--purple)]/20 bg-[var(--purple)]/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--purple)]">
            <Sparkles className="h-3 w-3" />
            Offre Purama
          </div>
          <span className="rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-2 py-0.5 text-[10px] font-bold text-white">
            -50 %
          </span>
        </div>

        <div className="flex items-start gap-3">
          <div
            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${promo.gradient} shadow-lg`}
          >
            <PromoIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Découvre {promo.name}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
              {promo.tagline}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--cyan)]/20 bg-[var(--cyan)]/5 px-3 py-2 text-xs">
          <p className="font-semibold text-[var(--cyan)]">-50 % le 1ᵉʳ mois + 100 € de prime</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Code auto-appliqué — rien à taper
          </p>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[var(--purple)]">
          Essayer {promo.name}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </a>
  );
}
