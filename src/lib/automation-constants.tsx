import type { StepType, WorkflowStatus } from '@/types/automation'

export const STEP_TYPES: { type: StepType; label: string; icon: string }[] = [
  { type: 'trigger', label: 'Declencheur', icon: '⚡' },
  { type: 'ai', label: 'Etape IA (AKASHA)', icon: '🤖' },
  { type: 'http', label: 'Appel HTTP', icon: '🌐' },
  { type: 'email', label: 'Envoi email', icon: '📧' },
  { type: 'delay', label: 'Attente', icon: '⏱️' },
  { type: 'condition', label: 'Condition', icon: '🔀' },
]

export const TEMPLATES = [
  {
    id: 'veille',
    name: 'Veille concurrentielle',
    description: 'Surveille tes concurrents automatiquement et recois des rapports quotidiens.',
    steps: 'Perplexity → Claude → Email',
    color: 'cyan' as const,
    icon: '🔍',
  },
  {
    id: 'social',
    name: 'Social media autopilote',
    description: 'Genere et publie du contenu multimedia sur toutes les plateformes.',
    steps: 'Claude → FLUX → Publication',
    color: 'pink' as const,
    icon: '📱',
  },
  {
    id: 'support',
    name: 'Support client 24/7',
    description: 'Reponds automatiquement aux emails clients avec l\'IA.',
    steps: 'Email → Claude → Reply',
    color: 'green' as const,
    icon: '🎧',
  },
  {
    id: 'rapport',
    name: 'Rapport hebdomadaire',
    description: 'Genere et envoie des rapports analytics complets chaque semaine.',
    steps: 'Analytics → Claude → PDF',
    color: 'gold' as const,
    icon: '📊',
  },
  {
    id: 'lead',
    name: 'Lead nurturing',
    description: 'Automatise le suivi de tes prospects avec des sequences email IA.',
    steps: 'Contact → Series emails IA',
    color: 'purple' as const,
    icon: '🎯',
  },
]

export const STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; color: 'green' | 'default'; dot: string }
> = {
  active: { label: 'Actif', color: 'green', dot: 'bg-green-400' },
  paused: { label: 'En pause', color: 'default', dot: 'bg-gray-400' },
  error: { label: 'Erreur', color: 'default', dot: 'bg-red-400' },
  draft: { label: 'Brouillon', color: 'default', dot: 'bg-yellow-400' },
}
