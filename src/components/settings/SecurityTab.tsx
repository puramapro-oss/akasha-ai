import type { User as SupabaseUser } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import PasswordChangeForm from '@/components/settings/PasswordChangeForm'

interface SecurityTabProps {
  user: SupabaseUser | null
}

export default function SecurityTab({ user }: SecurityTabProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4" data-testid="security-tab">
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Mot de passe</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Modifie ton mot de passe actuel. Le nouveau doit contenir au moins 6 caractères.
        </p>
        <PasswordChangeForm />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Session active</h2>
        <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-4 text-sm">
          <p className="text-[var(--text-primary)]">Email : {user?.email}</p>
          <p className="text-[var(--text-muted)]">
            Cree le : {user?.created_at ? formatDate(user.created_at) : '—'}
          </p>
          <p className="text-[var(--text-muted)]">
            Fournisseur : {user?.app_metadata?.provider ?? 'email'}
          </p>
        </div>
      </Card>

      <Card className="p-6 border border-red-500/20">
        <h2 className="mb-2 font-semibold text-red-400">Zone de danger</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          La suppression de ton compte est irreversible.
        </p>
        <Button
          variant="danger"
          onClick={() => router.push('/dashboard/memoire')}
          data-testid="delete-account-btn"
        >
          Supprimer mon compte
        </Button>
      </Card>
    </div>
  )
}
