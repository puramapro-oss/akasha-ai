// =============================================================================
// AKASHA AI — Analytics Utils
// Fonctions utilitaires pour analytics
// =============================================================================

import { PLAN_LIMITS } from '@/lib/constants';

export function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

export function getPlanDailyLimit(plan: string): number {
  if (plan === 'free') return PLAN_LIMITS.free.daily_questions;
  const parts = plan.split('_');
  if (parts.length === 2) {
    const [category, tier] = parts as [string, string];
    const cat = PLAN_LIMITS[category as keyof typeof PLAN_LIMITS];
    if (cat && typeof cat === 'object' && !('daily_questions' in cat)) {
      const tierData = (cat as Record<string, { daily_questions: number }>)[tier];
      if (tierData) return tierData.daily_questions;
    }
  }
  return 10;
}
