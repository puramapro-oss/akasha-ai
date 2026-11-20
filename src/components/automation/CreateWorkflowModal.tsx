import { useState } from 'react'
import { X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface CreateWorkflowModalProps {
  onClose: () => void
  onCreate: (name: string) => Promise<boolean>
}

export default function CreateWorkflowModal({ onClose, onCreate }: CreateWorkflowModalProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    const success = await onCreate(name)
    setCreating(false)
    if (success) {
      setName('')
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="create-workflow-modal"
    >
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Nouveau workflow</h2>
          <button aria-label="Fermer"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="name">
              Nom du workflow
            </label>
            <input id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Ex: Veille produit quotidienne"
              autoFocus
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
              data-testid="workflow-name-input"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              loading={creating}
              disabled={!name.trim()}
              data-testid="create-workflow-confirm"
            >
              Creer
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
