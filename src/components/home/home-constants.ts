// =============================================================================
// AKASHA AI — Home Constants
// Constantes pour les blocs de la page d'accueil
// =============================================================================

import { Sparkles, Film } from 'lucide-react';
import type { AmbassadorTier, CrossPromoApp } from './home-types';

// Barème V7 SUPREME — 9 paliers Bronze 200€ → Éternel 200K€
export const AMBASSADOR_TIERS: AmbassadorTier[] = [
  { id: 'bronze',  label: 'Bronze',  min: 10,    prime: 200,    color: '#cd7f32' },
  { id: 'argent',  label: 'Argent',  min: 25,    prime: 500,    color: '#94a3b8' },
  { id: 'or',      label: 'Or',      min: 50,    prime: 1000,   color: '#f59e0b' },
  { id: 'platine', label: 'Platine', min: 100,   prime: 2500,   color: '#a855f7' },
  { id: 'diamant', label: 'Diamant', min: 250,   prime: 6000,   color: '#06b6d4' },
  { id: 'legende', label: 'Légende', min: 500,   prime: 12000,  color: '#f43f5e' },
  { id: 'titan',   label: 'Titan',   min: 1000,  prime: 25000,  color: '#8b5cf6' },
  { id: 'dieu',    label: 'Dieu',    min: 5000,  prime: 100000, color: '#eab308' },
  { id: 'eternel', label: 'Éternel', min: 10000, prime: 200000, color: '#fbbf24' },
];

// Cross-promo mapping AKASHA → SUTRA (primaire), MIDAS (fallback). V7 §15
export const CROSS_PROMO_APPS = {
  primary: {
    slug: 'sutra',
    name: 'SUTRA',
    tagline: 'Éditeur vidéo IA — script, montage, voix en un clic',
    gradient: 'from-cyan-400 via-fuchsia-500 to-violet-600',
    icon: Film,
    url: 'https://sutra.purama.dev/go/akasha_ai?coupon=WELCOME50',
  } as CrossPromoApp,
  fallback: {
    slug: 'midas',
    name: 'MIDAS',
    tagline: 'Trading IA avec signaux temps réel',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    icon: Sparkles,
    url: 'https://midas.purama.dev/go/akasha_ai?coupon=WELCOME50',
  } as CrossPromoApp,
};

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}
