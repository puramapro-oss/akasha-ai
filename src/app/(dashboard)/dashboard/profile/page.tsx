'use client'

import { useEffect, useState } from 'react'
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
  const { user, profile, refetch } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [badgeCount, setBadgeCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setPseudo(profile.pseudo ?? '')
      setBio(profile.bio ?? '')
    }
  }, [profile])

  useEffect(() => {
    if (!user) return
    supabase.from('user_badges').select('badge_id', { count: 'exact' }).eq('user_id', user.id)
      .then(({ count }) => setBadgeCount(count ?? 0))
  }, [user, supabase])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      display_name: displayName,
      pseudo: pseudo || null,
      bio: bio || null,
    }).eq('id', user.id)
    setSaving(false)
    if (error) {
      toast.error('Erreur lors de la sauvegarde')
      return
    }
    toast.success('Profil mis a jour')
    refetch()
  }

  const xpTitle = XP_TITLES.find(t => (profile?.level ?? 1) >= t.min && (profile?.level ?? 1) <= t.max)?.title ?? 'Explorateur'
  const xpForNext = (profile?.level ?? 1) * 100
  const xpProgress = profile ? Math.min(100, (profile.xp / xpForNext) * 100) : 0

  if (!profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
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
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">Nom affiche</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">Pseudo</label>
            <input
              type="text"
              value={pseudo}
              onChange={e => setPseudo(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
              placeholder="mon_pseudo"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">Bio</label>
            <textarea
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
