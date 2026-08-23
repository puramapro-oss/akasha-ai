'use client';

import { useState } from 'react';

export interface AccountDeletionButtonProps {
  deletionScheduledFor?: string | null;
  deleteEndpoint: string;
  cancelEndpoint: string;
  graceDaysLabel?: string;
}

/** Doit matcher exactement le literal Zod attendu par `api/account/delete/route.ts` (POST). */
const CONFIRM_WORD = 'DELETE_MY_ACCOUNT';

/**
 * Demande de suppression de compte AVEC période de grâce (cohérent avec le pattern "30j"
 * déjà en vigueur ailleurs dans l'écosystème — session, retrait wallet). La suppression
 * réelle (CASCADE + `auth.admin.deleteUser`) est exécutée par le cron `api/cron/account-deletion`
 * une fois le délai écoulé, jamais de manière synchrone ici — laisse le temps d'annuler
 * une demande faite par erreur ou sous le coup de l'émotion.
 */
export default function AccountDeletionButton({
  deletionScheduledFor,
  deleteEndpoint,
  cancelEndpoint,
  graceDaysLabel = '30 jours',
}: AccountDeletionButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deletionScheduledFor) {
    return (
      <div className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p>
          Suppression programmée pour le{' '}
          <strong className="text-[var(--text-primary)]">
            {new Date(deletionScheduledFor).toLocaleDateString('fr-FR')}
          </strong>
          .
        </p>
        <button
          type="button"
          disabled={busy}
          data-testid="cancel-account-deletion-btn"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(cancelEndpoint, { method: 'DELETE' });
              if (!res.ok) throw new Error();
              window.location.reload();
            } catch {
              setError("L'annulation a échoué, réessayez ou contactez le support.");
              setBusy(false);
            }
          }}
          className="min-h-11 rounded-xl border border-[var(--border)] px-5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-60"
        >
          Annuler la suppression
        </button>
        {error && <p className="text-red-400">{error}</p>}
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid="delete-account-btn"
        className="min-h-11 rounded-xl border border-red-500/40 px-5 text-sm font-medium text-red-400 hover:bg-red-500/10"
      >
        Supprimer mon compte
      </button>
    );
  }

  return (
    <div className="space-y-3 text-sm text-[var(--text-secondary)]">
      <p>
        Cette action programme la suppression définitive de votre compte dans {graceDaysLabel}. Tapez{' '}
        <strong className="text-[var(--text-primary)]">{CONFIRM_WORD}</strong> pour confirmer.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={CONFIRM_WORD}
        data-testid="delete-account-confirm-input"
        className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={typed !== CONFIRM_WORD || busy}
          data-testid="confirm-delete-account-btn"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(deleteEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: CONFIRM_WORD }),
              });
              if (!res.ok) throw new Error();
              window.location.reload();
            } catch {
              setError('La demande a échoué, réessayez ou contactez le support.');
              setBusy(false);
            }
          }}
          className="min-h-11 rounded-xl bg-red-500 px-5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Confirmer la suppression'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-11 rounded-xl border border-[var(--border)] px-5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5"
        >
          Annuler
        </button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
