'use client';

// Page /compte/virements — historique des payouts Stripe (V4.1)

import { ConnectPayouts } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteVirementsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Tes virements</h1>
        <p className="mt-2 text-sm text-white/60">
          Historique des virements reçus sur ton compte bancaire Purama.
        </p>
      </header>
      <ConnectRoot>
        <ConnectPayouts />
      </ConnectRoot>
    </div>
  );
}
