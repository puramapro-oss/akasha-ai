'use client'

import { X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface ConfirmRegenModalProps {
  open: boolean
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function ConfirmRegenModal({ open, loading, onClose, onConfirm }: ConfirmRegenModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[var(--text-primary)]">Regenerer la cle ?</h2>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          L&apos;ancienne cle sera invalidee immediatement. Toutes les integrations utilisant cette cle
          cesseront de fonctionner.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} data-testid="confirm-regen">
            Regenerer
          </Button>
        </div>
      </Card>
    </div>
  )
}
