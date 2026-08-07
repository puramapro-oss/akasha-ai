'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Zap, Palette, Code2, Star, ArrowLeft, Sparkles, Euro } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import type { Plan, PlanTier } from '@/types'

interface PlanConfig {
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

const PLANS: PlanConfig[] = [
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

const TIER_LABELS: Record<PlanTier, string> = {
  essential: 'Essentiel',
  pro: 'Pro',
  max: 'Max',
}

const TIER_DESCRIPTIONS: Record<PlanTier, string> = {
  essential: '100 req/jour',
  pro: '500 req/jour',
  max: 'Illimité',
}

export default function PricingPage() {
  const router = useRouter()
  const { isAuthenticated, isSuperAdmin } = useAuth()
  const [selectedTier, setSelectedTier] = useState<PlanTier>('essential')
  const [loading, setLoading] = useState<string | null>(null)

  const handleChoose = async (plan: Exclude<Plan, 'free'>) => {
    if (!isAuthenticated) {
      router.push(`/signup?plan=${plan}&tier=${selectedTier}`)
      return
    }

    setLoading(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, tier: selectedTier }),
      })
      const data = await res.json() as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Erreur lors de la création du checkout')
      }

      window.location.assign(data.url)
    } catch (err) {
      console.error(err)
      toast.error('Impossible de démarrer le paiement. Réessaie.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)] px-4 py-16">
      {/* Back */}
      <div className="max-w-6xl mx-auto mb-10">
        <Link href="/" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>
      </div>

      {/* Financer banner */}
      <div className="max-w-6xl mx-auto mb-8">
        <Link
          href="/financer"
          data-testid="financer-banner"
          className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-6 py-4 text-sm transition-all hover:bg-emerald-400/10"
        >
          <Euro className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-400 font-medium">
            La plupart de nos clients ne paient rien grace aux aides.
          </span>
          <span className="text-[var(--cyan)] font-semibold hover:underline">
            Verifier mon eligibilite →
          </span>
        </Link>
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-[var(--cyan)]/10 border border-[var(--cyan)]/20 rounded-full px-4 py-1.5 text-[var(--cyan)] text-sm font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          14 jours remboursables
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4">
          Choisis ton plan
        </h1>
        <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
          47+ outils IA. 1 seul abonnement.
        </p>

        {/* Tier selector */}
        <div className="inline-flex bg-white/5 border border-[var(--border)] rounded-2xl p-1 mt-8 gap-1">
          {(['essential', 'pro', 'max'] as PlanTier[]).map((tier) => (
            <button
              key={tier}
              data-testid={`tier-${tier}`}
              onClick={() => setSelectedTier(tier)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                selectedTier === tier
                  ? 'bg-[var(--cyan)] text-black'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {TIER_LABELS[tier]}
              <span className="ml-1.5 text-xs opacity-70">· {TIER_DESCRIPTIONS[tier]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            data-testid={`plan-${plan.id}`}
            className={`relative flex flex-col p-6 transition-all duration-300 ${
              plan.popular ? 'ring-1 ring-[var(--gold)]/40 shadow-[0_0_40px_rgba(255,215,0,0.08)]' : ''
            }`}
          >
            {/* Popular badge */}
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--gold)] to-[var(--orange)] text-black text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                Le plus populaire
              </div>
            )}

            {/* Plan header */}
            <div className="mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${plan.color}20`, color: plan.color }}
              >
                {plan.icon}
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1" style={{ color: plan.color }}>
                {plan.name}
              </h2>
              <p className="text-[var(--text-secondary)] text-sm">{plan.tagline}</p>
            </div>

            {/* Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[var(--text-primary)]">
                  {plan.prices[selectedTier]}€
                </span>
                <span className="text-[var(--text-secondary)] text-sm">/mois</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {TIER_DESCRIPTIONS[selectedTier]}
              </p>
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                  {feature}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button
              data-testid={`btn-choose-${plan.id}`}
              onClick={() => void handleChoose(plan.id)}
              loading={loading === plan.id}
              disabled={!!loading}
              className="w-full"
              style={plan.popular ? { background: `linear-gradient(135deg, ${plan.color}, var(--orange))` } : undefined}
              variant={plan.popular ? 'primary' : 'secondary'}
            >
              {isSuperAdmin ? 'Accès admin' : 'Commencer'}
            </Button>
          </Card>
        ))}
      </div>

      {/* Free plan note */}
      <div className="max-w-6xl mx-auto text-center mb-16">
        <p className="text-[var(--text-muted)] text-sm">
          Préfères un plan gratuit ?{' '}
          <Link href={isAuthenticated ? '/dashboard' : '/signup'} className="text-[var(--cyan)] hover:underline">
            Commence avec 10 requêtes/jour
          </Link>
        </p>
      </div>

      {/* Comparison vs competitors */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-8">
          AKASHA vs Concurrents
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[var(--text-secondary)] font-medium">Fonctionnalité</th>
                <th className="text-center py-3 px-4 text-[var(--cyan)] font-bold">AKASHA</th>
                <th className="text-center py-3 px-4 text-[var(--text-muted)] font-medium">ChatGPT</th>
                <th className="text-center py-3 px-4 text-[var(--text-muted)] font-medium">Midjourney</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {[
                ['47+ outils IA intégrés', true, false, false],
                ['Multi-modèles (GPT-4, Claude, Gemini)', true, false, false],
                ['Génération image + vidéo + audio', true, false, true],
                ['Studio de code & workflows', true, false, false],
                ['Agents IA personnalisables', true, true, false],
                ['Prix dès 7€/mois', true, false, false],
                ['10% reversés à une asso', true, false, false],
              ].map(([feature, akasha, chatgpt, midj]) => (
                <tr key={String(feature)} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 text-[var(--text-secondary)]">{String(feature)}</td>
                  <td className="py-3 px-4 text-center">{akasha ? '✅' : '❌'}</td>
                  <td className="py-3 px-4 text-center text-[var(--text-muted)]">{chatgpt ? '✅' : '❌'}</td>
                  <td className="py-3 px-4 text-center text-[var(--text-muted)]">{midj ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div className="max-w-6xl mx-auto text-center mt-16">
        <p className="text-[var(--text-muted)] text-xs">
          10% de chaque abonnement est reversé à l'Association PURAMA (inclusion numérique). TVA non applicable, art. 293 B du CGI.
        </p>
      </div>
    </div>
  )
}
