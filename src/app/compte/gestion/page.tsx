'use client';

// Page /compte/gestion — gestion du compte Stripe Connect (V4.1)

import { ConnectAccountManagement } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteGestionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Gestion de ton compte</h1>
        <p className="mt-2 text-sm text-white/60">
          Modifie tes informations bancaires, ta représentation légale ou tes
          documents Purama.
        </p>
      </header>
      <ConnectRoot>
        <ConnectAccountManagement />
      </ConnectRoot>
    </div>
  );
}
