// =============================================================================
// AKASHA AI — Onboarding Config
// Types et constantes pour l'onboarding
// =============================================================================

import type { Plan } from '@/types';

export type UseCase = 'automate' | 'create' | 'build' | 'all';
export type Level = 'beginner' | 'intermediate' | 'expert';

export interface PlanOption {
  id: Exclude<Plan, 'free'>;
  name: string;
  color: string;
  priceEssential: number;
  highlight?: boolean;
}

export const INTERESTS = [
  'Marketing', 'Dev', 'Design', 'Business', 'Musique',
  'Vidéo', 'Écriture', 'Recherche', 'Data', 'Finance',
];

export const USE_CASES = [
  { id: 'automate' as UseCase, label: 'Automatiser', desc: 'Workflows, agents, répétitif', color: '#00d4ff' },
  { id: 'create' as UseCase, label: 'Créer', desc: 'Images, vidéos, textes, sons', color: '#ff6b9d' },
  { id: 'build' as UseCase, label: 'Coder', desc: 'Dev, debug, architecture', color: '#39ff14' },
  { id: 'all' as UseCase, label: 'Tout faire', desc: 'Je veux tout explorer', color: '#ffd700' },
];

export const LEVELS = [
  { id: 'beginner' as Level, label: 'Débutant', desc: "Je commence avec l'IA" },
  { id: 'intermediate' as Level, label: 'Intermédiaire', desc: "J'utilise déjà quelques outils" },
  { id: 'expert' as Level, label: 'Expert', desc: 'Je connais bien les LLMs' },
];

export const PLAN_OPTIONS: PlanOption[] = [
  { id: 'automate', name: 'AUTOMATE', color: '#00d4ff', priceEssential: 7 },
  { id: 'create', name: 'CREATE', color: '#ff6b9d', priceEssential: 7 },
  { id: 'build', name: 'BUILD', color: '#39ff14', priceEssential: 7 },
  { id: 'complete', name: 'COMPLET', color: '#ffd700', priceEssential: 22, highlight: true },
];
