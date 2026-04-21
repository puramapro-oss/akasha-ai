/**
 * AKASHA AI — Karma Split engine V4.1 (pure function)
 *
 * Répartit un paiement abonnement Stripe en 4 pools :
 *   reward 50% · adya 10% · asso 10% · sasu 30%
 *
 * Entrée : amount en CENTIMES d'euros (entier, >= 0).
 * Sortie : montants EN EUROS (decimal 2), somme = amount_eur exact.
 * SASU absorbe le reliquat d'arrondi (invariant somme=gross au cent près).
 */

import { KARMA_SPLIT_RATES, type KarmaSplitBreakdown } from '@/types/karma';

function centsToEur(cents: number): number {
  return Math.round(cents) / 100;
}

export function computeKarmaSplit(amountCents: number): KarmaSplitBreakdown {
  if (!Number.isFinite(amountCents)) {
    throw new Error(
      `computeKarmaSplit: amountCents must be finite, got ${amountCents}`,
    );
  }
  if (amountCents < 0) {
    throw new Error(
      `computeKarmaSplit: amountCents must be >= 0, got ${amountCents}`,
    );
  }

  const gross = Math.round(amountCents);
  const rewardCents = Math.round(gross * KARMA_SPLIT_RATES.reward);
  const adyaCents = Math.round(gross * KARMA_SPLIT_RATES.adya);
  const assoCents = Math.round(gross * KARMA_SPLIT_RATES.asso);
  const sasuCents = gross - rewardCents - adyaCents - assoCents;

  return {
    reward_eur: centsToEur(rewardCents),
    adya_eur: centsToEur(adyaCents),
    asso_eur: centsToEur(assoCents),
    sasu_eur: centsToEur(sasuCents),
    total_eur: centsToEur(gross),
  };
}
