'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Users, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import { formatDate, getInitials, cn } from '@/lib/utils'

interface CollabSpace {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
  member_count?: number
}

const SPACE_COLORS = [
  'from-[var(--cyan)] to-[var(--purple)]',
  'from-[var(--purple)] to-[var(--pink)]',
  'from-[var(--pink)] to-[var(--orange)]',
  'from-[var(--gold)] to-[var(--green)]',
  'from-[var(--green)] to-[var(--cyan)]',
]

export default function CollabPage() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<CollabSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const supabase = createClient()

  const fetchSpaces = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch owned spaces
    const { data: owned } = await supabase
      .from('collab_spaces')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    // Fetch joined spaces via collab_members
    const { data: membership } = await supabase
      .from('collab_members')
      .select('space_id')
      .eq('user_id', user.id)

    let joinedSpaces: CollabSpace[] = []
    if (membership && membership.length > 0) {
      const joinedIds = membership.map((m) => m.space_id)
      const { data: joined } = await supabase
        .from('collab_spaces')
        .select('*')
        .in('id', joinedIds)
        .neq('owner_id', user.id)
      if (joined) joinedSpaces = joined as CollabSpace[]
    }

    const all = [...(owned ?? []), ...joinedSpaces] as CollabSpace[]

    // Enrich with member counts
    const enriched = await Promise.all(
      all.map(async (s) => {
        const { count } = await supabase
          .from('collab_members')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', s.id)
        return { ...s, member_count: (count ?? 0) + 1 } // +1 for owner
      })
    )

    setSpaces(enriched)
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchSpaces()
  }, [fetchSpaces])

  const handleCreate = async () => {
    if (!user || !form.name.trim()) return
    setCreating(true)

    // Insert space
    const { data: space, error } = await supabase
      .from('collab_spaces')
      .insert({
        owner_id: user.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
      })
      .select()
      .single()

    if (error || !space) {
      toast.error('Erreur lors de la creation')
      setCreating(false)
      return
    }

    // Add self as admin member
    await supabase.from('collab_members').insert({
      space_id: space.id,
      user_id: user.id,
      role: 'admin',
    })

    toast.success(`Espace "${form.name}" cree !`)
    setShowModal(false)
    setForm({ name: '', description: '' })
    fetchSpaces()
    setCreating(false)
  }

  return (
    <div className="flex flex-col gap-6" data-testid="collab-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            Collaboration
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Travaille en equipe sur tes projets IA
          </p>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowModal(true)}
          data-testid="create-space-btn"
        >
          Creer un espace
        </Button>
      </div>

      {/* Spaces List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="Cree ton premier espace collaboratif"
          description="Invite tes collaborateurs et travaillez ensemble sur vos projets IA."
          action={
            <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
              Creer un espace
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="spaces-grid">
          {spaces.map((space, idx) => (
            <Link
              href={`/dashboard/collab/${space.id}`}
              key={space.id}
              data-testid={`space-card-${space.id}`}
            >
            <Card
              className="group flex cursor-pointer flex-col gap-4 p-5 transition-all hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white',
                    SPACE_COLORS[idx % SPACE_COLORS.length]
                  )}
                >
                  {getInitials(space.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--text-primary)]">{space.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {space.member_count ?? 1} membre{(space.member_count ?? 1) > 1 ? 's' : ''}
                    {space.owner_id === user?.id && (
                      <span className="ml-1.5 rounded-full bg-[var(--cyan)]/10 px-1.5 py-0.5 text-[var(--cyan)]">
                        Admin
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {space.description && (
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                  {space.description}
                </p>
              )}

              <p className="text-xs text-[var(--text-muted)] mt-auto">
                Cree le {formatDate(space.created_at)}
              </p>
            </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
          data-testid="create-space-modal"
        >
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Nouvel espace</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                  Nom de l&apos;espace <span className="text-red-400">*</span>
                </label>
                <input aria-label="Ex: Equipe Marketing"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Equipe Marketing"
                  autoFocus
                  className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
                  data-testid="space-name-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                  Description
                </label>
                <textarea aria-label="Decris l"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Decris l'objectif de cet espace..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
                  data-testid="space-desc-input"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleCreate}
                  loading={creating}
                  disabled={!form.name.trim()}
                  data-testid="create-space-confirm"
                >
                  Creer
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
