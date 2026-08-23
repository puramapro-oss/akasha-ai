import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface DataTabProps {
  onDeleteHistory: () => void
}

export default function DataTab({ onDeleteHistory }: DataTabProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4" data-testid="data-tab">
      <Card className="p-6">
        <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Ma memoire</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Exporte tes donnees, consulte tes acceptations legales ou supprime ton compte (RGPD).
        </p>
        <Button
          variant="secondary"
          onClick={() => router.push('/dashboard/memoire')}
          data-testid="export-data-btn"
        >
          Voir ma memoire
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
          Supprimer mon historique
        </h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Supprime toutes tes conversations et messages. Cette action est irreversible.
        </p>
        <Button variant="danger" onClick={onDeleteHistory} data-testid="delete-history-btn">
          Supprimer l&apos;historique
        </Button>
      </Card>

      <Card className="p-6 border border-red-500/20">
        <h2 className="mb-2 font-semibold text-red-400">Supprimer mon compte</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Programme la suppression definitive de ton compte (periode de grace 30 jours).
        </p>
        <Button
          variant="danger"
          onClick={() => router.push('/dashboard/memoire')}
          data-testid="delete-account-data-btn"
        >
          Supprimer mon compte
        </Button>
      </Card>
    </div>
  )
}
