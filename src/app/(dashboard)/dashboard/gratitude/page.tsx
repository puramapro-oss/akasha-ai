'use client'

import { useState, useCallback } from 'react'
import { Heart, Plus, ArrowLeft, Sparkles, Calendar } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { toast } from 'sonner'

interface GratitudeEntry {
  id: string
  content: string
  created_at: string
}

export default function GratitudePage() {
  const auth = useAuth()
  return <GratitudePageContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function GratitudePageContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { isAuthenticated } = auth
  const [newEntry, setNewEntry] = useState('')
  const [loading, setLoading] = useState(false)

  const readEntries = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/gratitude', { signal })
    if (!res.ok) throw new Error('Impossible de charger les gratitudes')
    const data = (await res.json()) as { entries: GratitudeEntry[]; streak: number }
    return { entries: data.entries ?? [], streak: data.streak ?? 0 }
  }, [])
  const { data, error, refetch: fetchEntries, setData, isCurrent } = useAsyncResource(
    isAuthenticated && auth.user?.id ? auth.user.id : null, readEntries,
    { entries: [] as GratitudeEntry[], streak: 0 },
  )
  const { entries, streak } = data
  const todayCount = entries.filter(e => new Date(e.created_at).toDateString() === new Date().toDateString()).length

  const handleSubmit = async () => {
    if (!newEntry.trim() || loading || !isCurrent()) return
    const submitted = newEntry
    if (todayCount >= 3) {
      toast.info('Tu as deja ecrit tes 3 gratitudes du jour. Bravo !')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/gratitude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newEntry.trim() }),
      })
      if (!isCurrent()) return
      if (!res.ok) throw new Error('Enregistrement indisponible')
      if (res.ok) {
        const data = (await res.json()) as { entry: GratitudeEntry }
        if (!isCurrent()) return
        setData(previous => ({ ...previous, entries: [data.entry, ...previous.entries] }))
        setNewEntry(current => current === submitted ? '' : current)
        const remaining = 2 - todayCount
        if (remaining > 0) {
          toast.success(`Gratitude enregistree ! Encore ${remaining} pour aujourd'hui.`)
        } else {
          toast.success('3/3 gratitudes du jour ! +100 pts')
        }
      }
    } catch {
      if (!isCurrent()) return
      toast.error('Impossible d\'enregistrer. Reessaie.')
    } finally {
      setLoading(false)
    }
  }

  const groupByDate = (items: GratitudeEntry[]) => {
    const groups: Record<string, GratitudeEntry[]> = {}
    for (const item of items) {
      const date = new Date(item.created_at).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    }
    return groups
  }

  const grouped = groupByDate(entries)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {error && <div role="alert">{error.message} <button onClick={() => void fetchEntries()}>Réessayer</button></div>}
      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
          <Heart className="w-6 h-6 text-pink-400" />
          Journal de Gratitude
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Ecris 3 gratitudes par jour. +100 pts quand tu completes les 3.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{todayCount}/3</p>
          <p className="text-xs text-[var(--text-muted)]">Aujourd&apos;hui</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-primary)] flex items-center justify-center gap-1">
            <Calendar className="w-4 h-4 text-[var(--cyan)]" />
            {streak}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Jours consecutifs</p>
        </Card>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all ${
              i < todayCount
                ? 'bg-gradient-to-br from-pink-400 to-purple-400 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                : 'bg-white/10 border border-[var(--border)]'
            }`}
          />
        ))}
      </div>

      {/* Input */}
      {todayCount < 3 && isAuthenticated && (
        <Card className="p-5 mb-8">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
            Pour quoi es-tu reconnaissant(e) aujourd&apos;hui ?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newEntry}
              onChange={e => setNewEntry(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
              data-testid="gratitude-input"
              className="flex-1 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] transition-colors"
              maxLength={280}
            />
            <Button
              onClick={() => void handleSubmit()}
              loading={loading}
              disabled={!newEntry.trim()}
              data-testid="btn-gratitude-add"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {todayCount >= 3 && (
        <Card className="p-5 mb-8 text-center border-pink-400/20 bg-pink-400/5">
          <Sparkles className="w-6 h-6 text-pink-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-pink-400">3/3 gratitudes du jour completees !</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">+100 pts. Reviens demain pour continuer ta serie.</p>
        </Card>
      )}

      {/* Entries */}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-6">
          <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3 capitalize">
            {date}
          </h3>
          <div className="space-y-2">
            {items.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-[var(--border)] p-4">
                <Heart className="w-4 h-4 text-pink-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-[var(--text-secondary)]">{entry.content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {entries.length === 0 && !loading && (
        <div className="text-center py-12">
          <Heart className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">L&apos;espace de toutes les possibilites.</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">Commence par ecrire ta premiere gratitude.</p>
        </div>
      )}
    </div>
  )
}
