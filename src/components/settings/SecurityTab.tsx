import type { User as SupabaseUser } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase'

interface SecurityTabProps {
  user: SupabaseUser | null
}

export default function SecurityTab({ user }: SecurityTabProps) {
  const router = useRouter()
  const supabase = createClient()

  return (
    <div className="flex flex-col gap-4" data-testid="security-tab">
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Mot de passe</h2>
        <Button
          variant="secondary"
          onClick={async () => {
            if (!user?.email) return
            const res = await supabase.auth.resetPasswordForEmail(user.email, {
              redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
            })
            if (res.error) toast.error('Erreur')
            else toast.success('Email envoye a ' + user.email)
          }}
          data-testid="reset-password-btn"
        >
          Changer le mot de passe
        </Button>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Un email de reinitialisation sera envoye a ton adresse.
        </p>
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
