'use client'

// =============================================================================
// AKASHA AI — AmbassadorBlock
// Bloc programme ambassadeur avec progression et timeline
// =============================================================================

import Link from 'next/link';
import { Crown, ArrowRight } from 'lucide-react';
import { AMBASSADOR_TIERS, formatNumber } from './home-constants';
import type { AmbassadorTier } from './home-types';

interface AmbassadorBlockProps {
  currentTier: AmbassadorTier | null;
  referralCount: number;
}

export default function AmbassadorBlock({
  currentTier,
  referralCount,
}: AmbassadorBlockProps) {
  const tierIndex = Math.max(
    0,
    AMBASSADOR_TIERS.findIndex(t => t.id === currentTier?.id)
  );
  const nextTier = currentTier ? AMBASSADOR_TIERS[tierIndex + 1] : AMBASSADOR_TIERS[0];
  const tierTarget = nextTier ?? AMBASSADOR_TIERS[AMBASSADOR_TIERS.length - 1];
  const progressPct = tierTarget
    ? Math.min(100, Math.round((referralCount / tierTarget.min) * 100))
    : 0;

  return (
    <Link
      href="/dashboard/ambassadeur"
      data-testid="home-ambassadeur-block"
      className="card group relative overflow-hidden p-5 transition-all hover:border-amber-500/30"
    >
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-amber-500/20 to-transparent blur-2xl" />

      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          <Crown className="h-3 w-3" />
          Programme Ambassadeur
        </div>

        <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
          {currentTier
            ? `${currentTier.label} — prime ${formatNumber(currentTier.prime)} €`
            : 'Deviens Ambassadeur AKASHA'}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {currentTier
            ? `Prochain palier : ${tierTarget.label} (${tierTarget.min} filleuls) → ${formatNumber(tierTarget.prime)} €`
            : `De Bronze 200 € à Éternel 200 000 €. Ton premier palier à ${AMBASSADOR_TIERS[0].min} filleuls.`}
        </p>

        {/* Barre progression vers palier cible */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
            {referralCount}/{tierTarget.min}
          </span>
        </div>

        {/* Mini timeline paliers */}
        <div className="mt-3 flex gap-1">
          {AMBASSADOR_TIERS.slice(0, 6).map((t) => {
            const reached = currentTier ? tierIndex >= AMBASSADOR_TIERS.indexOf(t) : false;
            return (
              <div
                key={t.id}
                title={`${t.label} — ${formatNumber(t.prime)} €`}
                className="h-1.5 flex-1 rounded-full transition-all"
                style={{ backgroundColor: reached ? t.color : 'rgba(255,255,255,0.06)' }}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
          {currentTier ? 'Voir mon dashboard' : 'Postuler comme Ambassadeur'}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
