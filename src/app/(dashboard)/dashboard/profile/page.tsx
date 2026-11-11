'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Save, Trophy, Flame, Star, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { formatDate, getInitials } from '@/lib/utils'
import { XP_TITLES } from '@/lib/constants'

export default function ProfilePage() {
  const auth = useAuth()
  return <ProfileContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function ProfileContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { user, profile: authProfile, refetch } = auth
  const incomingProfile = authProfile?.id === user?.id ? authProfile : null
  const [lastProfile, setLastProfile] = useState(incomingProfile)
  if (incomingProfile && lastProfile !== incomingProfile) setLastProfile(incomingProfile)
  const profile = incomingProfile ?? (lastProfile?.id === user?.id ? lastProfile : null)
  const profileError = auth.error ?? (authProfile && authProfile.id !== user?.id
    ? 'Le profil reçu ne correspond pas au compte courant.' : null)
  const errorNotice = profileError ? (
    <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
      <p>{profileError}</p>
      <Button variant="secondary" size="sm" onClick={() => void refetch()}>Réessayer</Button>
    </div>
  ) : null
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const [draft, setDraft] = useState<Partial<{ displayName: string; pseudo: string; bio: string }>>({})
  const displayName = draft.displayName ?? profile?.display_name ?? ''
  const pseudo = draft.pseudo ?? profile?.pseudo ?? ''
  const bio = draft.bio ?? profile?.bio ?? ''
  const setDisplayName = (value: string) => setDraft(prev => ({ ...prev, displayName: value }))
  const setPseudo = (value: string) => setDraft(prev => ({ ...prev, pseudo: value }))
  const setBio = (value: string) => setDraft(prev => ({ ...prev, bio: value }))
  const [saving, setSaving] = useState(false)
  const [badgeCount, setBadgeCount] = useState(0)
  const [supabase] = useState(createClient)

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    const abort = new AbortController()
    void supabase.from('user_badges').select('badge_id', { count: 'exact' }).eq('user_id', userId)
      .abortSignal(abort.signal).then(({ count }) => {
        if (!abort.signal.aborted) setBadgeCount(count ?? 0)
      })
    return () => abort.abort()
  }, [userId, supabase])

  const handleSave = async () => {
    if (!user || saving || !active.current) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        display_name: displayName, pseudo: pseudo || null, bio: bio || null,
      }).eq('id', user.id)
      if (!active.current) return
      if (error) throw error
      await refetch()
      if (active.current) toast.success('Profil mis a jour')
    } catch {
      if (active.current) toast.error('Erreur lors de la sauvegarde')
    } finally {
      if (active.current) setSaving(false)
    }
  }

  const xpTitle = XP_TITLES.find(t => (profile?.level ?? 1) >= t.min && (profile?.level ?? 1) <= t.max)?.title ?? 'Explorateur'
  const xpForNext = (profile?.level ?? 1) * 100
  const xpProgress = profile ? Math.min(100, (profile.xp / xpForNext) * 100) : 0

  if (!profile) {
    if (errorNotice) return errorNotice
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {errorNotice}
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mon Profil</h1>

      {/* Avatar + Stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="col-span-1 flex flex-col items-center p-6">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-3xl font-bold text-white">
              {getInitials(profile.display_name)}
            </div>
          </div>
          <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
            {profile.display_name ?? 'Utilisateur'}
          </h2>
          {profile.pseudo && (
            <p className="text-sm text-[var(--text-secondary)]">@{profile.pseudo}</p>
          )}
          <Badge variant="default" className="mt-2">{xpTitle}</Badge>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Membre depuis {formatDate(profile.created_at)}
          </p>
        </Card>

        <Card className="col-span-2 p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Statistiques</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/[0.03] p-4 text-center">
              <Star className="mx-auto h-6 w-6 text-[var(--cyan)]" />
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{profile.level}</p>
              <p className="text-xs text-[var(--text-secondary)]">Niveau</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 text-center">
              <Trophy className="mx-auto h-6 w-6 text-amber-400" />
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{profile.xp}</p>
              <p className="text-xs text-[var(--text-secondary)]">XP Total</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 text-center">
              <Flame className="mx-auto h-6 w-6 text-orange-400" />
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{profile.streak_count}</p>
              <p className="text-xs text-[var(--text-secondary)]">Streak</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 text-center">
              <Calendar className="mx-auto h-6 w-6 text-purple-400" />
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{badgeCount}</p>
              <p className="text-xs text-[var(--text-secondary)]">Badges</p>
            </div>
          </div>
          {/* XP Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Niveau {profile.level}</span>
              <span className="text-[var(--text-secondary)]">{profile.xp}/{xpForNext} XP</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Edit */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Modifier le profil</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="displayName">Nom affiche</label>
            <input id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="pseudo">Pseudo</label>
            <input id="pseudo"
              type="text"
              value={pseudo}
              onChange={e => setPseudo(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
              placeholder="mon_pseudo"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="bio">Bio</label>
            <textarea id="bio"
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              maxLength={200}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] resize-none"
              placeholder="Parle de toi en quelques mots..."
            />
          </div>
          <Button onClick={handleSave} loading={saving} icon={<Save className="h-4 w-4" />}>
            Enregistrer
          </Button>
        </div>
      </Card>
    </div>
  )
}
