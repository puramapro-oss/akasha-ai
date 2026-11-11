'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function PasswordChangeForm() {
  const { updatePassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updating, setUpdating] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }

    setUpdating(true)
    const { error } = await updatePassword(newPassword)
    setUpdating(false)

    if (error) {
      toast.error(
        error.message || 'Impossible de mettre à jour le mot de passe — reconnecte-toi et réessaie'
      )
      return
    }

    toast.success('Mot de passe mis à jour')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="newPassword"
        label="Nouveau mot de passe"
        type="password"
        placeholder="Au moins 6 caractères"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        data-testid="new-password-input"
        required
      />
      <Input
        id="confirmPassword"
        label="Confirmer le mot de passe"
        type="password"
        placeholder="Même mot de passe"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        data-testid="confirm-password-input"
        required
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={updating}
        disabled={!newPassword || !confirmPassword}
        data-testid="update-password-submit"
        className="self-start"
      >
        Mettre à jour le mot de passe
      </Button>
    </form>
  )
}
