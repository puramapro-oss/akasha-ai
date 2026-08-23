'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import AccountDeletionButton from './AccountDeletionButton';

export interface LegalAcceptanceRow {
  docType: string;
  version: string;
  acceptedAt: string;
}

export interface MaMemoirePageProps {
  appName: string;
  acceptations: LegalAcceptanceRow[];
  /** true si une suppression est déjà programmée (compte en période de grâce). */
  deletionScheduledFor?: string | null;
  exportEndpoint?: string;
  deleteEndpoint?: string;
  cancelDeleteEndpoint?: string;
}

const DOC_LABELS: Record<string, string> = {
  mentions: 'Mentions légales',
  cgu: 'CGU',
  cgv: 'CGV',
  confidentialite: 'Politique de confidentialité',
};

/**
 * Page « Ma mémoire » (NIYAMA-BRIEF.md §1) : voir/exporter/effacer ses données (RGPD art.
 * 15/17/20). Toute app copie ce fichier et le monte sur sa route `(dashboard)/ma-memoire`,
 * en lui passant les acceptations légales de l'utilisateur courant (lues côté serveur).
 */
export default function MaMemoirePage({
  appName,
  acceptations,
  deletionScheduledFor,
  exportEndpoint = '/api/legal/my-data',
  deleteEndpoint = '/api/account/delete',
  cancelDeleteEndpoint = '/api/account/delete',
}: MaMemoirePageProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(exportEndpoint);
      if (!res.ok) throw new Error(`Export impossible (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mes-donnees.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "L'export a échoué, réessayez.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="ma-memoire-page">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
          Ma mémoire
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Consultez, exportez ou effacez les données que {appName} conserve à votre sujet.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Exporter mes données</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Téléchargez une copie complète de vos données au format JSON (droit à la portabilité, art. 20 RGPD).
        </p>
        <Button variant="secondary" onClick={handleExport} loading={exporting} data-testid="ma-memoire-export-btn">
          Exporter mes données (JSON)
        </Button>
        {exportError && <p className="mt-2 text-sm text-red-400">{exportError}</p>}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Mes acceptations légales</h2>
        {acceptations.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Aucune acceptation enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            {acceptations.map((a) => (
              <li key={`${a.docType}-${a.version}`}>
                <span className="text-[var(--text-primary)]">{DOC_LABELS[a.docType] ?? a.docType}</span> — version{' '}
                {a.version} acceptée le {new Date(a.acceptedAt).toLocaleString('fr-FR')}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 border border-red-500/20">
        <h2 className="mb-2 font-semibold text-red-400">Supprimer mon compte</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          La suppression efface vos données personnelles et votre historique, sous réserve des obligations légales
          de conservation (comptable, fiscale).
        </p>
        <AccountDeletionButton
          deletionScheduledFor={deletionScheduledFor}
          deleteEndpoint={deleteEndpoint}
          cancelEndpoint={cancelDeleteEndpoint}
        />
      </Card>
    </div>
  );
}
