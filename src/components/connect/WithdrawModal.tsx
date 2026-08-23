'use client'

// =============================================================================
// AKASHA AI — WithdrawModal
// Modal de confirmation pour le retrait Stripe Connect
// =============================================================================

import { useEffect, useId } from 'react';
import {
  MIN_WITHDRAWAL_EUR,
  RECOMMENDED_WITHDRAWAL_EUR,
  FEES_GRID
} from '@/lib/connect/withdraw-constants';
import { useWithdraw } from './use-withdraw';
import type { WithdrawModalProps } from './withdraw-types';

export default function WithdrawModal({
  balanceEur,
  isOpen,
  onClose,
  onSuccess,
}: WithdrawModalProps) {
  const inputId = useId();
  const {
    amount,
    setAmount,
    submitting,
    error,
    success,
    submit,
    resetState,
  } = useWithdraw({
    balanceEur,
    onSuccess: (newBal) => {
      onSuccess({
        ok: true,
        new_balance_eur: newBal,
      });
    },
  });

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, submitting, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-title`}
      data-testid="withdraw-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1120] p-6 shadow-2xl">
        <h3
          id={`${inputId}-title`}
          className="text-xl font-bold text-white"
        >
          Retirer mes gains
        </h3>

        {success ? (
          <div
            data-testid="withdraw-success"
            className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300"
          >
            <p className="font-semibold">Retrait lancé ✨</p>
            <p className="mt-1">
              {(success.amount_eur ?? 0).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              })}{' '}
              transférés vers ton compte Stripe. Arrivée sous 1 à 3 jours
              ouvrés.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-[var(--cyan)] to-purple-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Solde disponible :{' '}
              <strong className="text-white">
                {balanceEur.toLocaleString('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </strong>
            </p>

            <div className="mt-5">
              <label
                htmlFor={inputId}
                className="block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Montant à retirer
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <input
                  id={inputId}
                  data-testid="withdraw-amount-input"
                  type="number"
                  inputMode="decimal"
                  min={MIN_WITHDRAWAL_EUR}
                  max={balanceEur}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting}
                  className="flex-1 bg-transparent text-lg font-semibold text-white outline-none"
                />
                <span className="text-sm text-white/60">€</span>
              </div>
              <p className="mt-2 text-xs text-white/50">
                Minimum {MIN_WITHDRAWAL_EUR}€. Recommandé :{' '}
                {RECOMMENDED_WITHDRAWAL_EUR}€+ pour réduire les frais Stripe.
              </p>
            </div>

            <div
              data-testid="withdraw-fees-grid"
              className="mt-5 rounded-lg border border-white/10 p-3 text-xs"
            >
              <p className="mb-2 font-semibold text-white">
                Frais Stripe (pas Purama)
              </p>
              <div className="space-y-1">
                {FEES_GRID.map((row) => (
                  <div
                    key={row.amount}
                    className="flex items-center justify-between"
                  >
                    <span className="text-white/60">{row.amount}€</span>
                    <span
                      className={
                        row.tone === 'danger'
                          ? 'text-red-400'
                          : row.tone === 'warn'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }
                    >
                      {row.feeEur.toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      })}{' '}
                      ({row.pct})
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-white/50">
                Purama ne prend aucune commission sur tes gains.
              </p>
            </div>

            {error ? (
              <p
                data-testid="withdraw-error"
                className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/5 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                data-testid="withdraw-confirm"
                onClick={submit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-gradient-to-r from-[var(--cyan)] to-purple-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : 'Confirmer le retrait'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
