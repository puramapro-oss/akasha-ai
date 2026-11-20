'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface InviteModalProps {
  show: boolean
  onClose: () => void
  onInvite: (email: string) => Promise<boolean>
}

export default function InviteModal({ show, onClose, onInvite }: InviteModalProps) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  if (!show) return null

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    const success = await onInvite(inviteEmail.trim())
    if (success) {
      setInviteEmail('')
      onClose()
    }
    setInviting(false)
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="invite-modal"
    >
      <Card className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Inviter un membre</h2>
          <button aria-label="Fermer"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <input aria-label="email@exemple.com"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            placeholder="email@exemple.com"
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
            data-testid="invite-email-input"
          />
          <p className="text-xs text-[var(--text-muted)]">
            L&apos;utilisateur doit deja avoir un compte AKASHA.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button
              onClick={handleInvite}
              loading={inviting}
              disabled={!inviteEmail.trim()}
              data-testid="confirm-invite-btn"
            >
              Inviter
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
