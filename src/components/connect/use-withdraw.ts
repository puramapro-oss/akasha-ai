'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MIN_WITHDRAWAL_EUR } from '@/lib/connect/withdraw-constants';
import type { WithdrawResponse } from './withdraw-types';

interface UseWithdrawOptions { balanceEur: number; onSuccess?: (newBalanceEur: number) => void }
interface Intent { version: 1; ownerId: string; requestKey: string; amount: number; requestedAmount: number | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storageKey = (ownerId: string) => 'akasha:withdrawal-intent:v1:' + ownerId;
const intentEvent = 'purama:withdrawal-intent-change';
function subscribeIntent(change: () => void) {
  window.addEventListener('storage', change);
  window.addEventListener(intentEvent, change);
  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(intentEvent, change);
  };
}
function validIntent(value: unknown, ownerId: string): value is Intent {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Intent>;
  return row.version === 1 && row.ownerId === ownerId && typeof row.requestKey === 'string'
    && uuid.test(row.requestKey) && typeof row.amount === 'number' && Number.isFinite(row.amount)
    && row.amount >= MIN_WITHDRAWAL_EUR && row.amount <= 100_000
    && Number.isSafeInteger(Math.round(row.amount * 100))
    && Math.abs(row.amount * 100 - Math.round(row.amount * 100)) < 0.00001
    && (row.requestedAmount === null || row.requestedAmount === row.amount);
}
function parseIntent(stored: string | null, ownerId: string): Intent | null {
  if (stored === null) return null;
  const value: unknown = JSON.parse(stored);
  if (!validIntent(value, ownerId)) throw new Error('La demande conservée doit être vérifiée avant un nouveau retrait.');
  return value;
}
function readIntent(ownerId: string) { return parseIntent(localStorage.getItem(storageKey(ownerId)), ownerId); }
function persistIntent(intent: Intent, expectedKey: string | null) {
  const current = readIntent(intent.ownerId);
  if ((current?.requestKey ?? null) !== expectedKey) {
    throw new Error('Une demande a changé dans un autre onglet. Rouvre ce retrait pour vérifier son état.');
  }
  const text = JSON.stringify(intent);
  localStorage.setItem(storageKey(intent.ownerId), text);
  if (localStorage.getItem(storageKey(intent.ownerId)) !== text) {
    throw new Error('Impossible de conserver cette demande. Aucun nouveau retrait ne sera envoyé.');
  }
  window.dispatchEvent(new Event(intentEvent));
}
function releaseIntent(intent: Intent) {
  if (readIntent(intent.ownerId)?.requestKey !== intent.requestKey) return;
  localStorage.removeItem(storageKey(intent.ownerId));
  window.dispatchEvent(new Event(intentEvent));
}

export function useWithdraw({ balanceEur, onSuccess }: UseWithdrawOptions) {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.id;
  const getStored = useCallback(() => {
    if (!ownerId) return null;
    try { return localStorage.getItem(storageKey(ownerId)); }
    catch { return 'unavailable'; }
  }, [ownerId]);
  const stored = useSyncExternalStore(subscribeIntent, getStored, () => null);
  let saved: Intent | null = null;
  let storageError: string | null = null;
  try { saved = ownerId ? parseIntent(stored, ownerId) : null; }
  catch { storageError = 'La demande conservée est indisponible. Aucun nouveau retrait ne sera envoyé.'; }
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<WithdrawResponse | null>(null);
  const [visibleOwner, setVisibleOwner] = useState(ownerId);
  if (visibleOwner !== ownerId) {
    setVisibleOwner(ownerId); setAmount(''); setSubmitting(false); setSuccess(null); setError(null);
  }
  const live = useRef(false);
  const owner = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    live.current = true; owner.current = ownerId; busy.current = false;
    return () => { live.current = false; request.current?.abort(); };
  }, [ownerId]);

  const resetState = useCallback(() => {
    if (!ownerId || owner.current !== ownerId || busy.current) return;
    try {
      const intent = readIntent(ownerId);
      setAmount(intent ? intent.amount.toFixed(2) : balanceEur.toFixed(2));
      setError(null); setSuccess(null);
    } catch { setError('La demande conservée doit être vérifiée avant un nouveau retrait.'); }
  }, [ownerId, balanceEur, setAmount, setError, setSuccess]);

  const perform = useCallback(async (action: 'withdraw' | 'cancel') => {
    if (busy.current || !ownerId || authLoading || owner.current !== ownerId || !live.current) return;
    let intent: Intent;
    try {
      const existing = readIntent(ownerId);
      if (existing) intent = existing;
      else {
        if (action === 'cancel') return;
        const parsed = Math.round(Number(amount.replace(',', '.')) * 100) / 100;
        if (!Number.isFinite(parsed) || parsed < MIN_WITHDRAWAL_EUR || parsed > balanceEur) {
          setError('Choisis un montant d’au moins ' + MIN_WITHDRAWAL_EUR + '€, dans la limite de ton solde.'); return;
        }
        intent = { version: 1, ownerId, requestKey: crypto.randomUUID(), amount: parsed, requestedAmount: parsed };
        persistIntent(intent, null);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible de conserver la demande.'); return;
    }
    busy.current = true; setSubmitting(true); setError(null);
    setAmount(intent.amount.toFixed(2));
    const controller = new AbortController(); request.current = controller;
    const current = () => live.current && owner.current === ownerId && request.current === controller;
    const deadline = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch('/api/connect/withdraw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ owner_id: ownerId, idempotency_key: intent.requestKey,
          ...(action === 'cancel' ? { action } : {}),
          ...(intent.requestedAmount === null ? {} : { amount_eur: intent.requestedAmount }) }),
      });
      const raw: unknown = await response.json();
      if (!current()) return;
      if (!raw || typeof raw !== 'object') throw new Error('Réponse du retrait non confirmée.');
      const body = raw as WithdrawResponse;
      if (action === 'cancel' && response.ok && body.ok === true
          && body.operation_state === 'cancelled' && body.cancellation_confirmed === true
          && body.request_key === intent.requestKey && body.owner_id === ownerId
          && typeof body.cancellation_id === 'string' && uuid.test(body.cancellation_id)) {
        releaseIntent(intent); setSuccess(null);
        setError('La demande précédente est annulée. Tu peux choisir un nouveau montant.');
        return;
      }
      if (body.active_request && body.supersedes_request_key === intent.requestKey) {
        const active = body.active_request;
        const adopted: Intent = { version: 1, ownerId: active.owner_id, requestKey: active.request_key,
          amount: active.amount_eur, requestedAmount: active.requested_amount_eur };
        if (!validIntent(adopted, ownerId)) throw new Error('Demande active non confirmée.');
        persistIntent(adopted, intent.requestKey);
        setAmount(adopted.amount.toFixed(2));
        setError('Une demande existe déjà. Vérifie son état avec le même bouton.'); return;
      }
      const matches = body.request_key === intent.requestKey;
      const balanceConfirmed = typeof body.new_balance_eur === 'number' && Number.isFinite(body.new_balance_eur)
        && body.new_balance_eur >= 0;
      const confirmed = balanceConfirmed && matches && typeof body.request_id === 'string' && uuid.test(body.request_id)
        && body.amount_eur === intent.amount;
      if (response.ok && body.ok === true && body.operation_state === 'completed' && confirmed
          && typeof body.transfer_id === 'string' && /^tr_[A-Za-z0-9]+$/.test(body.transfer_id)) {
        releaseIntent(intent); setSuccess(body);
        if (!body.replayed && typeof body.new_balance_eur === 'number' && Number.isFinite(body.new_balance_eur)) {
          onSuccess?.(body.new_balance_eur);
        }
        window.dispatchEvent(new CustomEvent('purama:withdraw-success'));
        return;
      }
      if (confirmed && body.operation_state === 'rejected' && body.balance_restored === true) {
        releaseIntent(intent);
        window.dispatchEvent(new CustomEvent('purama:withdraw-success'));
      }
      setError(typeof body.error === 'string' ? body.error : 'Le retrait attend une confirmation. Vérifie cette même demande.');
    } catch {
      if (current()) setError('Le résultat du retrait est inconnu. La demande est conservée ; vérifie son état sans en créer une nouvelle.');
    } finally {
      clearTimeout(deadline);
      if (current()) { busy.current = false; request.current = null; setSubmitting(false); }
    }
  }, [ownerId, authLoading, amount, balanceEur, onSuccess, setAmount, setError, setSuccess, setSubmitting]);

  const submit = useCallback(() => perform('withdraw'), [perform]);
  const cancel = useCallback(() => perform('cancel'), [perform]);

  return { amount: saved ? saved.amount.toFixed(2) : amount, setAmount, submitting,
    pending: stored !== null, error: storageError ?? error, success, submit, cancel, resetState,
    ready: Boolean(ownerId) && !authLoading && !storageError };
}
