'use client'

// =============================================================================
// AKASHA AI — WithdrawButton (V4.1 Axe 3)
// Composant client retrait wallet → Stripe Connect.
// - Disabled si balance < 20€ ou payouts_enabled=false
// - Ouvre modal confirmation avec grille frais Stripe
// =============================================================================

import { useCallback, useState } from 'react';
import { MIN_WITHDRAWAL_EUR } from '@/lib/connect/withdraw-constants';
import WithdrawModal from './WithdrawModal';
import type { WithdrawButtonProps, WithdrawResponse } from './withdraw-types';

export default function WithdrawButton({
  balanceEur,
  onSuccess,
  disabled,
  label = 'Retirer mes gains',
}: WithdrawButtonProps) {
  const canWithdraw = !disabled && balanceEur >= MIN_WITHDRAWAL_EUR;
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = useCallback(() => {
    if (!canWithdraw) return;
    setModalOpen(true);
  }, [canWithdraw]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleSuccess = useCallback((response: WithdrawResponse) => {
    if (typeof response.new_balance_eur === 'number') {
      onSuccess?.(response.new_balance_eur);
    }
  }, [onSuccess]);

  return (
    <>
      <button
        type="button"
        data-testid="withdraw-button"
        aria-label={label}
        onClick={openModal}
        disabled={!canWithdraw}
        className={
          'inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition ' +
          (canWithdraw
            ? 'bg-gradient-to-r from-[var(--cyan)] to-purple-500 text-white hover:brightness-110'
            : 'cursor-not-allowed bg-white/10 text-white/40')
        }
      >
        {label}
      </button>

      {!canWithdraw && balanceEur < MIN_WITHDRAWAL_EUR ? (
        <p
          className="mt-2 text-xs text-white/50"
          data-testid="withdraw-below-min"
        >
          Solde minimum pour retirer : {MIN_WITHDRAWAL_EUR}€. Il te manque{' '}
          {(MIN_WITHDRAWAL_EUR - balanceEur).toLocaleString('fr-FR', {
            style: 'currency',
            currency: 'EUR',
          })}
          .
        </p>
      ) : null}

      {!canWithdraw && disabled ? (
        <p
          className="mt-2 text-xs text-white/50"
          data-testid="withdraw-disabled"
        >
          Active d&apos;abord ton compte Stripe Connect.
        </p>
      ) : null}

      <WithdrawModal
        balanceEur={balanceEur}
        isOpen={modalOpen}
        onClose={closeModal}
        onSuccess={handleSuccess}
      />
    </>
  );
}
