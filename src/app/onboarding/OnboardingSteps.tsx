'use client'

// =============================================================================
// AKASHA AI — OnboardingSteps (étapes 1-4)
// =============================================================================

import { ChevronRight, Zap, Palette, Code2, Star, Brain, Layers, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import type { PlanTier } from '@/types';
import { USE_CASES as USE_CASES_DATA, LEVELS as LEVELS_DATA, PLAN_OPTIONS, INTERESTS, type UseCase, type Level, type PlanOption } from './onboarding-config';

const USE_CASE_ICONS = {
  automate: <Zap className="w-6 h-6" />,
  create: <Palette className="w-6 h-6" />,
  build: <Code2 className="w-6 h-6" />,
  all: <Star className="w-6 h-6" />,
};

const LEVEL_ICONS = {
  beginner: <Brain className="w-6 h-6" />,
  intermediate: <Layers className="w-6 h-6" />,
  expert: <Rocket className="w-6 h-6" />,
};

const USE_CASES = USE_CASES_DATA.map(uc => ({ ...uc, icon: USE_CASE_ICONS[uc.id] }));
const LEVELS = LEVELS_DATA.map(lv => ({ ...lv, icon: LEVEL_ICONS[lv.id] }));

interface OnboardingStepsProps {
  step: number;
  pseudo: string;
  setPseudo: (v: string) => void;
  interests: string[];
  toggleInterest: (i: string) => void;
  userId: string | undefined;
  isSuperAdmin: boolean;
  checkoutLoading: string | null;
  saving: boolean;
  setStep: (s: number) => void;
  setCheckoutLoading: (id: string | null) => void;
  onFinish: () => Promise<void>;
}

export default function OnboardingSteps({
  step,
  pseudo,
  setPseudo,
  interests,
  toggleInterest,
  userId,
  isSuperAdmin,
  checkoutLoading,
  saving,
  setStep,
  setCheckoutLoading,
  onFinish,
}: OnboardingStepsProps) {
  const supabase = createClient();

  const saveUseCase = async (uc: UseCase) => {
    if (userId) {
      await supabase.from('profiles').update({ onboarding_use_case: uc }).eq('id', userId);
    }
    setStep(2);
  };

  const saveLevel = async (lv: Level) => {
    if (userId) {
      await supabase.from('profiles').update({ onboarding_level: lv }).eq('id', userId);
    }
    setStep(3);
  };

  const handleChoosePlan = async (planId: PlanOption['id'], tier: PlanTier = 'essential') => {
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, tier, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Erreur checkout');
      window.location.assign(data.url);
    } catch {
      toast.error('Impossible de démarrer le paiement');
      setCheckoutLoading(null);
    }
  };

  return (
    <>
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
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${uc.color}20`, color: uc.color }}>
                  {uc.icon}
                </div>
                <p className="font-bold text-[var(--text-primary)] mb-1" style={{ color: uc.color }}>{uc.label}</p>
                <p className="text-xs text-[var(--text-secondary)]">{uc.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

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
                <div className="w-12 h-12 rounded-xl bg-[var(--cyan)]/10 text-[var(--cyan)] flex items-center justify-center flex-shrink-0">{lv.icon}</div>
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
              <Card key={plan.id} data-testid={`onboarding-plan-${plan.id}`} className={`relative flex flex-col p-4 ${plan.highlight ? 'ring-1 ring-[var(--gold)]/30' : ''}`}>
                {plan.highlight && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--gold)] to-[var(--orange)] text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    Populaire
                  </div>
                )}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 text-xs font-bold" style={{ background: `${plan.color}20`, color: plan.color }}>{plan.name[0]}</div>
                <p className="font-bold text-xs mb-1" style={{ color: plan.color }}>{plan.name}</p>
                <p className="text-[var(--text-primary)] font-bold text-lg leading-none mb-1">{plan.priceEssential}€<span className="text-xs font-normal text-[var(--text-muted)]">/mois</span></p>
                <div className="inline-block bg-white/5 text-[var(--text-muted)] text-[10px] px-1.5 py-0.5 rounded mb-3 w-fit">Essai 14j</div>
                <Button size="sm" variant={plan.highlight ? 'primary' : 'secondary'} className="w-full text-xs mt-auto" loading={checkoutLoading === plan.id} disabled={!!checkoutLoading} onClick={() => void handleChoosePlan(plan.id)} data-testid={`onboarding-choose-${plan.id}`}>Choisir</Button>
              </Card>
            ))}
          </div>
          <div className="text-center">
            <button onClick={() => setStep(4)} data-testid="onboarding-skip-plan" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline transition-colors">
              Continuer avec le plan gratuit (10 req/jour)
            </button>
          </div>
          {isSuperAdmin && (
            <div className="mt-3 text-center">
              <button onClick={() => setStep(4)} className="text-xs text-[var(--cyan)] hover:underline">Super admin — passer l&apos;étape paiement</button>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="w-full max-w-lg" data-testid="step-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-2">
            Personnalise ton espace
          </h1>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-8">
            Dernière étape, promis 🎉
          </p>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="pseudo">Ton pseudo (pour le classement)</label>
              <input id="pseudo" type="text" value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="ex: AkashaMaster42" maxLength={30} data-testid="input-pseudo" className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--cyan)]/50 focus:bg-white/8 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">Tes intérêts (multi-sélection)</label>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((interest) => {
                  const selected = interests.includes(interest);
                  return (
                    <button key={interest} onClick={() => toggleInterest(interest)} data-testid={`interest-${interest}`} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${selected ? 'bg-[var(--cyan)]/20 border-[var(--cyan)]/50 text-[var(--cyan)]' : 'bg-white/5 border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-primary)]'}`}>
                      {selected && <span className="mr-1">✓</span>}{interest}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={() => void onFinish()} loading={saving} size="lg" className="w-full" data-testid="btn-finish-onboarding">
              Terminer et accéder à AKASHA 🚀
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
