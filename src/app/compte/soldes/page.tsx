'use client';

// Page /compte/soldes — balances Stripe (V4.1)

import { ConnectBalances } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteSoldesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Tes soldes</h1>
        <p className="mt-2 text-sm text-white/60">
          Soldes disponibles et en transit vers ton compte bancaire.
        </p>
      </header>
      <ConnectRoot>
        <ConnectBalances />
      </ConnectRoot>
    </div>
  );
}
