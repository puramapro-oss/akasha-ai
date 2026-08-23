import type { AmbassadorTier } from '@/types/ambassador'

// Barème V7 SUPREME — 9 paliers de Bronze 200€ à Éternel 200K€
export const AMBASSADOR_TIERS: readonly AmbassadorTier[] = [
  { id: 'bronze',  label: 'Bronze',  min: 10,    prime: 200,    color: '#cd7f32', perk: 'Kit ambassadeur + badge' },
  { id: 'argent',  label: 'Argent',  min: 25,    prime: 500,    color: '#94a3b8', perk: 'Early access + page perso' },
  { id: 'or',      label: 'Or',      min: 50,    prime: 1000,   color: '#f59e0b', perk: 'Plan offert + page publique' },
  { id: 'platine', label: 'Platine', min: 100,   prime: 2500,   color: '#a855f7', perk: 'Priorité features + événements' },
  { id: 'diamant', label: 'Diamant', min: 250,   prime: 6000,   color: '#06b6d4', perk: 'Accès VIP + coach dédié' },
  { id: 'legende', label: 'Légende', min: 500,   prime: 12000,  color: '#f43f5e', perk: 'Commissions héréditaires' },
  { id: 'titan',   label: 'Titan',   min: 1000,  prime: 25000,  color: '#8b5cf6', perk: 'Ligne directe + beta' },
  { id: 'dieu',    label: 'Dieu',    min: 5000,  prime: 100000, color: '#eab308', perk: 'Parts ecosystème' },
  { id: 'eternel', label: 'Éternel', min: 10000, prime: 200000, color: '#fbbf24', perk: '1% parts + transmissible' },
] as const
