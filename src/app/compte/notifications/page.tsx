'use client';

// Page /compte/notifications — bannière d'alerte Stripe Connect (V4.1)

import { ConnectNotificationBanner } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';

export default function CompteNotificationsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Tes notifications</h1>
        <p className="mt-2 text-sm text-white/60">
          Actions requises sur ton compte Purama (KYC, documents manquants).
        </p>
      </header>
      <ConnectRoot>
        <ConnectNotificationBanner />
      </ConnectRoot>
    </div>
  );
}
