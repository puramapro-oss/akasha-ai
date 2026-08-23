// =============================================================================
// AKASHA AI — Home Types
// Types pour les blocs de la page d'accueil
// =============================================================================

export interface AmbassadorTier {
  id: string;
  label: string;
  min: number;
  prime: number;
  color: string;
}

export interface CrossPromoApp {
  slug: string;
  name: string;
  tagline: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  url: string;
}

export interface ReferralStats {
  count: number;
  totalCommissions: number;
  ambassadorTier: string | null;
}
