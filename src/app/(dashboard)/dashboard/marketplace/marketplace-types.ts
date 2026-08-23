// =============================================================================
// AKASHA AI — Marketplace Types
// Types pour la marketplace d'agents
// =============================================================================

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  price: number;
  rating: number | null;
  installs_count: number;
  is_verified: boolean;
  is_public: boolean;
  user_id: string;
  category: string | null;
  created_at: string;
  creator_name?: string;
}

export interface OwnAgent {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  icon: string | null;
  color: string | null;
}

export type FilterType = 'all' | 'new' | 'free' | 'premium';
