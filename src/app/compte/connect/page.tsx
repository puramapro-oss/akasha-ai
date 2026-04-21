'use client';

// =============================================================================
// AKASHA AI — /compte/connect (V4.1 Axe 3)
// Hub unifié Stripe Connect : status + onboarding + withdraw + 7 quicklinks.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ConnectAccountOnboarding } from '@stripe/react-connect-js';
import ConnectRoot from '@/components/connect/ConnectRoot';
import WithdrawButton from '@/components/connect/WithdrawButton';
import type { ConnectAccountSummary, ConnectOnboardingStage } from '@/types/stripe';

const STAGE_LABELS: Record<
  ConnectOnboardingStage,
  { label: string; color: string }
> = {
  not_started: { label: 'Non démarré', color: 'bg-white/10 text-white/70' },
  in_progress: {
    label: 'En cours',
    color: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
  },
  requirements_due: {
    label: 'Action requise',
    color: 'bg-red-500/10 text-red-300 border border-red-500/30',
  },
  verified: {
    label: 'Vérifié',
    color: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
  },
};

const QUICK_LINKS: Array<{ href: string; label: string; desc: string }> = [
  { href: '/compte/gestion', label: 'Gestion', desc: 'Modifier infos bancaires et docs' },
  { href: '/compte/virements', label: 'Virements', desc: 'Historique des payouts' },
  { href: '/compte/soldes', label: 'Soldes', desc: 'Disponible et en transit' },
  { href: '/compte/documents', label: 'Documents', desc: 'Reçus et factures Stripe' },
  { href: '/compte/paiements', label: 'Paiements', desc: 'Historique des encaissements' },
  { href: '/compte/notifications', label: 'Notifications', desc: 'Actions requises' },
  { href: '/compte/configuration', label: 'Configuration', desc: 'KYC + identité' },
];

export default function CompteConnectHubPage() {
  const [summary, setSummary] = useState<ConnectAccountSummary | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, balanceRes] = await Promise.all([
        fetch('/api/connect/status'),
        fetch('/api/wallet/balance'),
      ]);

      if (statusRes.ok) {
        setSummary((await statusRes.json()) as ConnectAccountSummary);
      } else {
        const body = await statusRes.json().catch(() => ({}));
        throw new Error(body.error ?? 'Impossible de lire le statut Connect');
      }

      if (balanceRes.ok) {
        const b = (await balanceRes.json()) as { balance_eur: number };
        setBalance(Number(b.balance_eur ?? 0));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onWithdrawSuccess = () => refresh();
    window.addEventListener('purama:withdraw-success', onWithdrawSuccess);
    return () =>
      window.removeEventListener('purama:withdraw-success', onWithdrawSuccess);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Ton compte Purama</h1>
        <p className="mt-2 text-sm text-white/60">
          Configure ton compte, vérifie tes soldes et retire tes gains AKASHA
          en un clic.
        </p>
      </header>

      {/* Status Card */}
      <section
        data-testid="connect-status-card"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Statut de ton compte
            </h2>
            {summary ? (
              <div
                data-testid="connect-status-badge"
                className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STAGE_LABELS[summary.onboarding_stage].color}`}
              >
                {STAGE_LABELS[summary.onboarding_stage].label}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/50">Chargement…</p>
            )}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="text-xs text-white/60 hover:text-white disabled:opacity-50"
          >
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>

        {summary ? (
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Field
              label="KYC"
              value={summary.kyc_verified_at ? 'Vérifié' : 'En attente'}
              tone={summary.kyc_verified_at ? 'ok' : 'warn'}
            />
            <Field
              label="Virements"
              value={summary.payouts_enabled ? 'Actifs' : 'Désactivés'}
              tone={summary.payouts_enabled ? 'ok' : 'warn'}
              testid="connect-payouts-enabled"
            />
            <Field
              label="Paiements"
              value={summary.charges_enabled ? 'Actifs' : 'Désactivés'}
              tone={summary.charges_enabled ? 'ok' : 'warn'}
            />
            <Field
              label="Solde wallet"
              value={
                balance !== null
                  ? balance.toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    })
                  : '—'
              }
              tone="neutral"
              testid="wallet-balance"
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        ) : null}
      </section>

      {/* Onboarding si pas verified */}
      {summary && summary.onboarding_stage !== 'verified' ? (
        <section
          data-testid="onboarding-section"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h2 className="text-lg font-semibold text-white">
            Finalise la vérification
          </h2>
          <p className="mt-2 text-sm text-white/60">
            Quelques minutes suffisent : fournis ton identité, tes infos
            bancaires et termine les documents demandés par Stripe.
          </p>
          <div className="mt-5">
            <ConnectRoot allowAutoOnboard initialSummary={summary}>
              <ConnectAccountOnboarding onExit={refresh} />
            </ConnectRoot>
          </div>
        </section>
      ) : null}

      {/* Withdraw si verified + payouts_enabled */}
      {summary?.payouts_enabled && balance !== null ? (
        <section
          data-testid="withdraw-section"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h2 className="text-lg font-semibold text-white">Retirer mes gains</h2>
          <p className="mt-2 text-sm text-white/60">
            Transfert Stripe instantané vers ton compte bancaire vérifié.
            Arrivée 1 à 3 jours ouvrés.
          </p>
          <div className="mt-5">
            <WithdrawButton
              balanceEur={balance}
              onSuccess={() => refresh()}
              disabled={!summary.payouts_enabled}
            />
          </div>
        </section>
      ) : null}

      {/* Quick Links grid */}
      <section
        data-testid="connect-quicklinks"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      >
        <h2 className="text-lg font-semibold text-white">Accès rapide</h2>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-[var(--cyan)]/50 hover:bg-white/5"
            >
              <p className="text-sm font-semibold text-white group-hover:text-[var(--cyan)]">
                {link.label}
              </p>
              <p className="mt-1 text-xs text-white/50">{link.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'neutral';
  testid?: string;
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : 'text-white';
  return (
    <div
      data-testid={testid}
      className="rounded-lg border border-white/10 bg-black/20 p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className={`mt-1 text-sm font-medium ${color}`}>{value}</p>
    </div>
  );
}
