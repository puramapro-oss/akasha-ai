'use client'

// =============================================================================
// AKASHA AI — Onboarding Page (4 étapes)
// =============================================================================

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import ProgressBar from './ProgressBar';
import OnboardingSteps from './OnboardingSteps';

export default function OnboardingPage() {
  const auth = useAuth();
  return <OnboardingContent key={auth.user?.id ?? 'signed-out'} auth={auth} />;
}

function OnboardingContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const router = useRouter();
  const { user, profile, loading, isAuthenticated, isSuperAdmin } = auth;
  const [supabase] = useState(createClient);
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const [step, setStep] = useState(1);
  const [pseudoDraft, setPseudo] = useState<string | null>(null);
  const pseudo = pseudoDraft ?? profile?.display_name ?? '';
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login?next=/onboarding');
    }
    if (!loading && profile?.onboarding_completed) {
      router.replace('/dashboard');
    }
  }, [loading, isAuthenticated, profile, router]);

  const handleFinish = async () => {
    if (!user || saving || !active.current) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          pseudo: pseudo.trim() || null,
          display_name: pseudo.trim() || profile?.display_name || null,
          interests,
          onboarding_completed: true,
        })
        .eq('id', user.id);
      if (!active.current) return;
      if (error) throw error;
      router.replace('/dashboard');
    } catch {
      if (active.current) toast.error('Erreur lors de la sauvegarde');
    } finally {
      if (active.current) setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <Loader2 className="w-8 h-8 text-[var(--cyan)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-start px-4 py-12">
      <ProgressBar step={step} />
      <OnboardingSteps
        step={step}
        pseudo={pseudo}
        setPseudo={setPseudo}
        interests={interests}
        toggleInterest={toggleInterest}
        userId={user?.id}
        isSuperAdmin={isSuperAdmin}
        checkoutLoading={checkoutLoading}
        saving={saving}
        setStep={setStep}
        setCheckoutLoading={setCheckoutLoading}
        onFinish={handleFinish}
      />
    </div>
  );
}
