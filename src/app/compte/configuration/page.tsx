'use client';

// Page /compte/configuration — onboarding KYC Stripe Connect (V4.1)
// Crée automatiquement le compte si l'user n'en a pas encore.

import { ConnectAccountOnboarding } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteConfigurationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">
          Configuration de ton compte
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Vérifie ton identité pour activer tes retraits et paiements Purama.
          Fournis tes infos à Stripe — Purama ne les stocke jamais.
        </p>
      </header>
      <ConnectRoot allowAutoOnboard>
        <ConnectAccountOnboarding
          onExit={() => {
            window.location.href = '/compte/gestion';
          }}
        />
      </ConnectRoot>
    </div>
  );
}
