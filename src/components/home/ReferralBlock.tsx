'use client'

// =============================================================================
// AKASHA AI — ReferralBlock
// Bloc de parrainage avec lien, QR code, boutons copy/share
// =============================================================================

import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Users, Share2, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils';

interface ReferralBlockProps {
  referralLink: string;
  referralCount: number;
  totalCommissions: number;
  qrDataUrl: string | null;
  loading: boolean;
}

export default function ReferralBlock({
  referralLink,
  referralCount,
  totalCommissions,
  qrDataUrl,
  loading,
}: ReferralBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(referralLink);
    if (ok) {
      setCopied(true);
      toast.success('Lien copié');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Découvre AKASHA AI',
          text: 'L\'agrégateur multi-IA le plus complet. Tu vas adorer.',
          url: referralLink,
        });
      } catch {
        /* utilisateur a annulé */
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-[var(--cyan)]/20 to-transparent blur-2xl" />

      <div className="relative flex items-start justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Users className="h-3 w-3" />
            Parrainage
          </div>
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            {referralCount > 0
              ? `${referralCount} ami${referralCount > 1 ? 's' : ''} invité${referralCount > 1 ? 's' : ''}`
              : 'Invite tes amis, gagne des commissions'}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {referralCount > 0
              ? `${totalCommissions.toFixed(2)} € générés · 50 % N1 + 15 % N2 + 7 % N3 à vie`
              : 'Ton premier filleul te rapporte des commissions à vie.'}
          </p>
        </div>
        {qrDataUrl && (
          <div
            aria-hidden
            className="hidden flex-shrink-0 rounded-lg border border-white/10 bg-white/[0.02] p-1.5 sm:block"
          >
            <Image
              src={qrDataUrl}
              width={56}
              height={56}
              alt=""
              className="h-14 w-14"
              unoptimized
            />
          </div>
        )}
      </div>

      <div className="relative mt-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 truncate rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--cyan)]">
          <span className="truncate font-mono">{loading ? '…' : referralLink}</span>
        </div>
        <button
          onClick={handleCopy}
          aria-label="Copier le lien de parrainage"
          data-testid="home-copy-referral"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleShare}
          aria-label="Partager mon lien"
          data-testid="home-share-referral"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-3 text-xs font-semibold text-white transition-all hover:brightness-110"
        >
          <Share2 className="h-3.5 w-3.5" />
          Partager
        </button>
      </div>
    </div>
  );
}
