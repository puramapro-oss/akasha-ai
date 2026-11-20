import { X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface DeleteHistoryModalProps {
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteHistoryModal({ onCancel, onConfirm }: DeleteHistoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[var(--text-primary)]">
            Supprimer l&apos;historique ?
          </h2>
          <button aria-label="Fermer" onClick={onCancel}>
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Toutes tes conversations seront supprimees definitivement.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} data-testid="confirm-delete-history">
            Supprimer
          </Button>
        </div>
      </Card>
    </div>
  )
}
