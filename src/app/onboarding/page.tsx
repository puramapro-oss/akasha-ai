'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Palette, Code2, Star, Brain, Layers, Rocket, ChevronRight, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import type { Plan, PlanTier } from '@/types'

type UseCase = 'automate' | 'create' | 'build' | 'all'
type Level = 'beginner' | 'intermediate' | 'expert'

const INTERESTS = [
  'Marketing', 'Dev', 'Design', 'Business', 'Musique',
  'Vidéo', 'Écriture', 'Recherche', 'Data', 'Finance',
]

const USE_CASES: { id: UseCase; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
  { id: 'automate', label: 'Automatiser', desc: 'Workflows, agents, répétitif', color: '#00d4ff', icon: <Zap className="w-6 h-6" /> },
  { id: 'create', label: 'Créer', desc: 'Images, vidéos, textes, sons', color: '#ff6b9d', icon: <Palette className="w-6 h-6" /> },
  { id: 'build', label: 'Coder', desc: 'Dev, debug, architecture', color: '#39ff14', icon: <Code2 className="w-6 h-6" /> },
  { id: 'all', label: 'Tout faire', desc: 'Je veux tout explorer', color: '#ffd700', icon: <Star className="w-6 h-6" /> },
]

const LEVELS: { id: Level; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'beginner', label: 'Débutant', desc: "Je commence avec l'IA", icon: <Brain className="w-6 h-6" /> },
  { id: 'intermediate', label: 'Intermédiaire', desc: "J'utilise déjà quelques outils", icon: <Layers className="w-6 h-6" /> },
  { id: 'expert', label: 'Expert', desc: 'Je connais bien les LLMs', icon: <Rocket className="w-6 h-6" /> },
]

interface PlanOption {
  id: Exclude<Plan, 'free'>
  name: string
  color: string
  priceEssential: number
  highlight?: boolean
}

const PLAN_OPTIONS: PlanOption[] = [
  { id: 'automate', name: 'AUTOMATE', color: '#00d4ff', priceEssential: 7 },
  { id: 'create', name: 'CREATE', color: '#ff6b9d', priceEssential: 7 },
  { id: 'build', name: 'BUILD', color: '#39ff14', priceEssential: 7 },
  { id: 'complete', name: 'COMPLET', color: '#ffd700', priceEssential: 22, highlight: true },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user, profile, loading, isAuthenticated, isSuperAdmin } = useAuth()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [level, setLevel] = useState<Level | null>(null)
  const [pseudo, setPseudo] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  // Redirect if already completed onboarding
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login?next=/onboarding')
    }
    if (!loading && profile?.onboarding_completed) {
      router.replace('/dashboard')
    }
    if (!loading && profile?.display_name) {
      setPseudo(profile.display_name)
    }
  }, [loading, isAuthenticated, profile, router])

  const saveUseCase = async (uc: UseCase) => {
    setUseCase(uc)
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_use_case: uc })
        .eq('id', user.id)
    }
    setStep(2)
  }

  const saveLevel = async (lv: Level) => {
    setLevel(lv)
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_level: lv })
        .eq('id', user.id)
    }
    setStep(3)
  }

  const handleChoosePlan = async (planId: Exclude<Plan, 'free'>, tier: PlanTier = 'essential') => {
    setCheckoutLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, tier }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Erreur checkout')
      window.location.assign(data.url)
    } catch {
      toast.error('Impossible de démarrer le paiement')
      setCheckoutLoading(null)
    }
  }

  const handleSkipPlan = () => setStep(4)

  const handleFinish = async () => {
    if (!user) return
    setSaving(true)
    try {
      await supabase
        .from('profiles')
        .update({
          pseudo: pseudo.trim() || null,
          display_name: pseudo.trim() || profile?.display_name || null,
          interests,
          onboarding_completed: true,
        })
        .eq('id', user.id)

      router.replace('/dashboard')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <Loader2 className="w-8 h-8 text-[var(--cyan)] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-start px-4 py-12">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-10" data-testid="onboarding-progress">
        <div className="flex items-center justify-between mb-3">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  step > s
                    ? 'bg-[var(--cyan)] text-black'
                    : step === s
                    ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] border border-[var(--cyan)]'
                    : 'bg-white/5 text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 4 && (
                <div className={`h-0.5 w-16 sm:w-24 mx-1 transition-all duration-500 ${step > s ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] rounded-full transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1 — Use case */}
      {step === 1 && (
        <div className="w-full max-w-lg" data-testid="step-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-2">
            Tu veux utiliser l&apos;IA pour ?
          </h1>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-8">
            On personnalisera ton espace selon tes besoins.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {USE_CASES.map((uc) => (
              <button
                key={uc.id}
                data-testid={`usecase-${uc.id}`}
                onClick={() => void saveUseCase(uc.id)}
                className="glass p-5 rounded-2xl text-left transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-glow)] active:scale-[0.98] group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${uc.color}20`, color: uc.color }}
                >
                  {uc.icon}
                </div>
                <p className="font-bold text-[var(--text-primary)] mb-1" style={{ color: uc.color }}>
                  {uc.label}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">{uc.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Level */}
      {step === 2 && (
        <div className="w-full max-w-lg" data-testid="step-2">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-2">
            Ton niveau avec l&apos;IA ?
          </h1>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-8">
            On adaptera tes suggestions et ton interface.
          </p>
          <div className="flex flex-col gap-3">
            {LEVELS.map((lv) => (
              <button
                key={lv.id}
                data-testid={`level-${lv.id}`}
                onClick={() => void saveLevel(lv.id)}
                className="glass p-5 rounded-2xl text-left flex items-center gap-4 transition-all duration-200 hover:scale-[1.01] hover:border-[var(--border-glow)] active:scale-[0.98] group"
              >
                <div className="w-12 h-12 rounded-xl bg-[var(--cyan)]/10 text-[var(--cyan)] flex items-center justify-center flex-shrink-0">
                  {lv.icon}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-[var(--text-primary)]">{lv.label}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{lv.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--cyan)] transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Plan */}
      {step === 3 && (
        <div className="w-full max-w-2xl" data-testid="step-3">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-2">
            Quel plan te correspond ?
          </h1>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-8">
            Commence gratuitement ou débloque des fonctions avancées.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {PLAN_OPTIONS.map((plan) => (
              <Card
                key={plan.id}
                data-testid={`onboarding-plan-${plan.id}`}
                className={`relative flex flex-col p-4 ${plan.highlight ? 'ring-1 ring-[var(--gold)]/30' : ''}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--gold)] to-[var(--orange)] text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    Populaire
                  </div>
                )}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 text-xs font-bold"
                  style={{ background: `${plan.color}20`, color: plan.color }}
                >
                  {plan.name[0]}
                </div>
                <p className="font-bold text-xs mb-1" style={{ color: plan.color }}>
                  {plan.name}
                </p>
                <p className="text-[var(--text-primary)] font-bold text-lg leading-none mb-1">
                  {plan.priceEssential}€
                  <span className="text-xs font-normal text-[var(--text-muted)]">/mois</span>
                </p>
                <div className="inline-block bg-white/5 text-[var(--text-muted)] text-[10px] px-1.5 py-0.5 rounded mb-3 w-fit">
                  Essai 14j
                </div>
                <Button
                  size="sm"
                  variant={plan.highlight ? 'primary' : 'secondary'}
                  className="w-full text-xs mt-auto"
                  loading={checkoutLoading === plan.id}
                  disabled={!!checkoutLoading}
                  onClick={() => void handleChoosePlan(plan.id)}
                  data-testid={`onboarding-choose-${plan.id}`}
                >
                  Choisir
                </Button>
              </Card>
            ))}
          </div>

          {/* Skip / free */}
          <div className="text-center">
            <button
              onClick={handleSkipPlan}
              data-testid="onboarding-skip-plan"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline transition-colors"
            >
              Continuer avec le plan gratuit (10 req/jour)
            </button>
          </div>

          {isSuperAdmin && (
            <div className="mt-3 text-center">
              <button
                onClick={handleSkipPlan}
                className="text-xs text-[var(--cyan)] hover:underline"
              >
                Super admin — passer l&apos;étape paiement
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4 — Personalize */}
      {step === 4 && (
        <div className="w-full max-w-lg" data-testid="step-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-2">
            Personnalise ton espace
          </h1>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-8">
            Dernière étape, promis 🎉
          </p>

          <div className="space-y-6">
            {/* Pseudo */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Ton pseudo (pour le classement)
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="ex: AkashaMaster42"
                maxLength={30}
                data-testid="input-pseudo"
                className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--cyan)]/50 focus:bg-white/8 transition-all"
              />
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                Tes intérêts (multi-sélection)
              </label>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((interest) => {
                  const selected = interests.includes(interest)
                  return (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      data-testid={`interest-${interest}`}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
                        selected
                          ? 'bg-[var(--cyan)]/20 border-[var(--cyan)]/50 text-[var(--cyan)]'
                          : 'bg-white/5 border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {selected && <span className="mr-1">✓</span>}
                      {interest}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Finish */}
            <Button
              onClick={() => void handleFinish()}
              loading={saving}
              size="lg"
              className="w-full"
              data-testid="btn-finish-onboarding"
            >
              Terminer et accéder à AKASHA 🚀
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
