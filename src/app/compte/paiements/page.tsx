'use client';

// Page /compte/paiements — historique des paiements reçus (V4.1)

import { ConnectPayments } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function ComptePaiementsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Tes paiements</h1>
        <p className="mt-2 text-sm text-white/60">
          Les paiements encaissés via Purama apparaissent ici dès qu&apos;ils
          sont autorisés par Stripe.
        </p>
      </header>
      <ConnectRoot>
        <ConnectPayments />
      </ConnectRoot>
    </div>
  );
}
