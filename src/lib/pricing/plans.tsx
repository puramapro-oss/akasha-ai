import { Zap, Palette, Code2, Star } from 'lucide-react'
import type { Plan, PlanTier } from '@/types'

export interface PlanConfig {
  id: Exclude<Plan, 'free'>
  name: string
  tagline: string
  color: string
  gradient: string
  icon: React.ReactNode
  popular?: boolean
  features: string[]
  prices: {
    essential: number
    pro: number
    max: number
  }
}

export const PLANS: PlanConfig[] = [
  {
    id: 'automate',
    name: 'AUTOMATE',
    tagline: 'Automatise tes workflows',
    color: '#00d4ff',
    gradient: 'from-[#00d4ff]/20 to-[#00d4ff]/5',
    icon: <Zap className="w-5 h-5" />,
    features: [
      '47+ outils IA intégrés',
      'Workflows automatisés',
      'Agents personnalisés',
      'Intégrations API',
      'Rapports automatiques',
    ],
    prices: { essential: 7, pro: 11, max: 16 },
  },
  {
    id: 'create',
    name: 'CREATE',
    tagline: 'Crée du contenu pro',
    color: '#ff6b9d',
    gradient: 'from-[#ff6b9d]/20 to-[#ff6b9d]/5',
    icon: <Palette className="w-5 h-5" />,
    features: [
      'Génération image & vidéo',
      'Studio audio IA',
      'Écriture & copywriting',
      'Templates créatifs',
      'Export multi-format',
    ],
    prices: { essential: 7, pro: 11, max: 16 },
  },
  {
    id: 'build',
    name: 'BUILD',
    tagline: 'Code & développe plus vite',
    color: '#39ff14',
    gradient: 'from-[#39ff14]/20 to-[#39ff14]/5',
    icon: <Code2 className="w-5 h-5" />,
    features: [
      'Assistant code multi-langage',
      'Debug & revue de code',
      'Génération SQL & API',
      'Console API complète',
      'Déploiement guidé',
    ],
    prices: { essential: 7, pro: 11, max: 16 },
  },
  {
    id: 'complete',
    name: 'COMPLET',
    tagline: 'Tout AKASHA, sans limites',
    color: '#ffd700',
    gradient: 'from-[#ffd700]/20 to-[#ffd700]/5',
    icon: <Star className="w-5 h-5" />,
    popular: true,
    features: [
      'Accès AUTOMATE + CREATE + BUILD',
      'Modèles GPT-4o, Claude, Gemini',
      'Quotas prioritaires illimités',
      'Support premium dédié',
      'Accès anticipé aux nouvelles fonctions',
    ],
    prices: { essential: 22, pro: 33, max: 44 },
  },
]

export const TIER_LABELS: Record<PlanTier, string> = {
  essential: 'Essentiel',
  pro: 'Pro',
  max: 'Max',
}

export const TIER_DESCRIPTIONS: Record<PlanTier, string> = {
  essential: '100 req/jour',
  pro: '500 req/jour',
  max: 'Illimité',
}
