// =============================================================================
// AKASHA AI — Marketplace Constants
// Constantes pour la marketplace
// =============================================================================

import type { FilterType } from './marketplace-types';

export const FILTER_LABELS: Record<FilterType, string> = {
  all: 'Populaires',
  new: 'Nouveaux',
  free: 'Gratuits',
  premium: 'Premium',
};

export const ACCENT_COLORS = [
  'bg-[var(--cyan)]',
  'bg-[var(--purple)]',
  'bg-[var(--pink)]',
  'bg-[var(--green)]',
  'bg-[var(--gold)]',
  'bg-[var(--orange)]',
];
