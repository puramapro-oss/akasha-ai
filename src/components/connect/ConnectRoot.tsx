'use client';

// =============================================================================
// AKASHA AI — ConnectRoot (V4.1)
// Wrapper client unique pour toutes les pages /compte/*. Charge la session
// Stripe Connect, initialise loadConnectAndInitialize, et fournit le contexte
// aux Embedded Components.
//
// Thème : dark AKASHA (cyan #00d4ff + purple).
// =============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from '@stripe/connect-js';
import { ConnectComponentsProvider } from '@stripe/react-connect-js';
import type { ConnectAccountSummary } from '@/types/stripe';

interface Props {
  initialSummary?: ConnectAccountSummary | null;
  allowAutoOnboard?: boolean;
  children: ReactNode;
}

type Phase =
  | { status: 'loading' }
  | { status: 'no_account' }
  | { status: 'error'; message: string }
  | { status: 'ready'; instance: StripeConnectInstance };

const AKASHA_APPEARANCE = {
  variables: {
    fontFamily: '"Space Grotesk", "DM Sans", system-ui, sans-serif',
    colorPrimary: '#00d4ff',
    colorBackground: '#0b1120',
    colorText: '#f5f7fa',
    colorDanger: '#ef4444',
    borderRadius: '14px',
    spacingUnit: '8px',
  },
};

export default function ConnectRoot({
  initialSummary = null,
  allowAutoOnboard = false,
  children,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ status: 'loading' });
  const initialised = useRef(false);

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/connect/account-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur session' }));
      throw new Error(err.error ?? 'Impossible de charger la session Connect');
    }
    const body = (await res.json()) as { client_secret: string };
    return body.client_secret;
  }, []);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    if (!publishableKey) {
      setPhase({
        status: 'error',
        message:
          'Clé publique Stripe manquante. Configure NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.',
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let summary: ConnectAccountSummary | null = initialSummary;
        if (!summary) {
          const statusRes = await fetch('/api/connect/status');
          if (!statusRes.ok) {
            const err = await statusRes
              .json()
              .catch(() => ({ error: 'Erreur statut' }));
            throw new Error(err.error ?? 'Impossible de lire le statut Connect');
          }
          summary = (await statusRes.json()) as ConnectAccountSummary;
        }

        if (!summary.stripe_account_id) {
          if (!allowAutoOnboard) {
            if (!cancelled) setPhase({ status: 'no_account' });
            return;
          }
          const onboardRes = await fetch('/api/connect/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!onboardRes.ok) {
            const err = await onboardRes
              .json()
              .catch(() => ({ error: 'Erreur onboard' }));
            throw new Error(err.error ?? 'Création du compte Stripe impossible');
          }
        }

        const instance = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret,
          appearance: AKASHA_APPEARANCE,
          locale: 'fr-FR',
        });

        if (!cancelled) setPhase({ status: 'ready', instance });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Erreur inconnue Connect';
        if (!cancelled) setPhase({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowAutoOnboard, fetchClientSecret, initialSummary, publishableKey]);

  if (phase.status === 'loading') {
    return (
      <div
        data-testid="connect-loading"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center"
      >
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--cyan)] border-t-transparent" />
        <p className="mt-4 text-sm text-white/60">Chargement de ton compte Purama…</p>
      </div>
    );
  }

  if (phase.status === 'no_account') {
    return (
      <div
        data-testid="connect-no-account"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center"
      >
        <h2 className="text-xl font-semibold text-white">
          Active d&apos;abord ton compte Purama
        </h2>
        <p className="mt-3 max-w-md mx-auto text-sm text-white/60">
          Cette page nécessite un compte Stripe Connect vérifié. Configure-le
          en quelques minutes pour débloquer tes retraits, paiements et
          documents.
        </p>
        <Link
          href="/compte/configuration"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[var(--cyan)] to-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Configurer mon compte
        </Link>
      </div>
    );
  }

  if (phase.status === 'error') {
    return (
      <div
        data-testid="connect-error"
        className="rounded-2xl border border-red-500/40 bg-white/[0.03] p-8"
      >
        <h2 className="text-lg font-semibold text-red-400">
          Une erreur est survenue
        </h2>
        <p className="mt-2 text-sm text-white/70">{phase.message}</p>
        <p className="mt-4 text-xs text-white/50">
          Réessaie dans un instant. Si le problème persiste, contacte-nous via
          /contact.
        </p>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={phase.instance}>
      {children}
    </ConnectComponentsProvider>
  );
}
