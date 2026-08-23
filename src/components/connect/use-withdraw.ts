// =============================================================================
// AKASHA AI — useWithdraw Hook
// Logique métier pour le retrait Stripe Connect
// =============================================================================

import { useCallback, useState } from 'react';
import { MIN_WITHDRAWAL_EUR } from '@/lib/connect/withdraw-constants';
import type { WithdrawResponse } from './withdraw-types';

interface UseWithdrawOptions {
  balanceEur: number;
  onSuccess?: (newBalanceEur: number) => void;
}

export function useWithdraw({ balanceEur, onSuccess }: UseWithdrawOptions) {
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<WithdrawResponse | null>(null);

  const resetState = useCallback(() => {
    setAmount(balanceEur.toFixed(2));
    setError(null);
    setSuccess(null);
  }, [balanceEur]);

  const submit = useCallback(async () => {
    setError(null);
    const parsed = Number(amount.replace(',', '.'));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Montant invalide');
      return;
    }

    if (parsed < MIN_WITHDRAWAL_EUR) {
      setError(`Montant minimum ${MIN_WITHDRAWAL_EUR}€.`);
      return;
    }

    if (parsed > balanceEur) {
      setError('Tu ne peux pas retirer plus que ton solde.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/connect/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_eur: parsed,
          idempotency_key: crypto.randomUUID()
        }),
      });

      const body = (await res.json().catch(() => ({}))) as WithdrawResponse;

      if (!res.ok || !body.ok) {
        setError(body.error ?? 'Erreur lors du retrait. Réessaie.');
        setSubmitting(false);
        return;
      }

      setSuccess(body);

      if (typeof body.new_balance_eur === 'number') {
        onSuccess?.(body.new_balance_eur);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('purama:withdraw-success', {
            detail: {
              amount_eur: body.amount_eur,
              transfer_id: body.transfer_id,
            },
          }),
        );
      }

      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
      setSubmitting(false);
    }
  }, [amount, balanceEur, onSuccess]);

  return {
    amount,
    setAmount,
    submitting,
    error,
    success,
    submit,
    resetState,
  };
}
