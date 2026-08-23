'use client'

// =============================================================================
// AKASHA AI — HomeBlocks
// Orchestrateur des 3 blocs : parrainage, ambassadeur, cross-promo
// =============================================================================

import { useAuth } from '@/hooks/useAuth';
import { APP_DOMAIN } from '@/lib/constants';
import { useReferralStats } from './use-referral-stats';
import { useQRCode } from './use-qr-code';
import { AMBASSADOR_TIERS, CROSS_PROMO_APPS } from './home-constants';
import ReferralBlock from './ReferralBlock';
import AmbassadorBlock from './AmbassadorBlock';
import CrossPromoBlock from './CrossPromoBlock';

export default function HomeBlocks() {
  const { user, profile } = useAuth();
  const { stats, loading } = useReferralStats(user?.id);

  const referralCode = profile?.referral_code ?? '';
  const referralLink = referralCode
    ? `https://${APP_DOMAIN}/go/${referralCode}`
    : `https://${APP_DOMAIN}/signup`;

  const qrDataUrl = useQRCode(referralLink);

  const currentTier = stats.ambassadorTier
    ? AMBASSADOR_TIERS.find(t => t.id === stats.ambassadorTier) ?? null
    : null;

  return (
    <section
      aria-label="Parrainage, Ambassadeur et Cross-Promo"
      className="grid gap-4 lg:grid-cols-3"
    >
      <ReferralBlock
        referralLink={referralLink}
        referralCount={stats.count}
        totalCommissions={stats.totalCommissions}
        qrDataUrl={qrDataUrl}
        loading={loading}
      />

      <AmbassadorBlock
        currentTier={currentTier}
        referralCount={stats.count}
      />

      <CrossPromoBlock promo={CROSS_PROMO_APPS.primary} />
    </section>
  );
}
