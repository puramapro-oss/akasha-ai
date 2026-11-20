import type { User as SupabaseUser } from '@supabase/supabase-js'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface ProfileForm {
  display_name: string
  pseudo: string
  bio: string
}

interface ProfileTabProps {
  user: SupabaseUser | null
  profileForm: ProfileForm
  onFormChange: (update: Partial<ProfileForm>) => void
  onSave: () => void
  saving: boolean
  email?: string | null
}

export default function ProfileTab({
  user,
  profileForm,
  onFormChange,
  onSave,
  saving,
  email,
}: ProfileTabProps) {
  return (
    <Card className="p-6" data-testid="profile-tab">
      <h2 className="mb-5 font-semibold text-[var(--text-primary)]">Informations du profil</h2>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xl font-bold text-black">
            {profileForm.display_name?.[0]?.toUpperCase() ?? email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {profileForm.display_name || 'Utilisateur'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Nom d&apos;affichage
            </label>
            <input
              type="text"
              value={profileForm.display_name}
              onChange={(e) => onFormChange({ display_name: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
              data-testid="input-display-name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Pseudo
            </label>
            <input
              type="text"
              value={profileForm.pseudo}
              onChange={(e) => onFormChange({ pseudo: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
              data-testid="input-pseudo"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Email</label>
          <input
            type="email"
            value={user?.email ?? ''}
            readOnly
            className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-muted)] cursor-not-allowed"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Bio</label>
          <textarea aria-label="Decris-toi en quelques mots..."
            value={profileForm.bio}
            onChange={(e) => onFormChange({ bio: e.target.value })}
            rows={3}
            placeholder="Decris-toi en quelques mots..."
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
            data-testid="input-bio"
          />
        </div>

        <Button onClick={onSave} loading={saving} data-testid="save-profile-btn">
          Sauvegarder
        </Button>
      </div>
    </Card>
  )
}
