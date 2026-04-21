'use client';

// Page /compte/documents — reçus et documents Stripe (V4.1)

import { ConnectDocuments } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteDocumentsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Tes documents</h1>
        <p className="mt-2 text-sm text-white/60">
          Reçus, factures et documents légaux liés à ton compte Purama.
        </p>
      </header>
      <ConnectRoot>
        <ConnectDocuments />
      </ConnectRoot>
    </div>
  );
}
