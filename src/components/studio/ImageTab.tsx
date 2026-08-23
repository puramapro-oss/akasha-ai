'use client'

import { useState, useEffect, useCallback } from 'react'
import { Image as ImageIcon, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { Generation, IMAGE_MODELS } from './types'

export default function ImageTab() {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<'flux' | 'dalle' | 'imagen'>('flux')
  const [loading, setLoading] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(12)
      setHistory((data as Generation[]) ?? [])
    } catch {
      // silent
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Entre un prompt'); return }
    setLoading(true)
    setResultUrl(null)
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Erreur de generation')
        return
      }
      setResultUrl(data.url ?? null)
      toast.success('Image generee !')
      fetchHistory()
    } catch {
      toast.error('Service temporairement indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Generer une image</h2>

        {/* Model selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          {IMAGE_MODELS.map(m => (
            <button
              key={m.id}
              disabled={!m.available}
              onClick={() => m.available && setModel(m.id as 'flux' | 'dalle' | 'imagen')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-all',
                m.id === model && m.available
                  ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
                  : m.available
                  ? 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                  : 'cursor-not-allowed opacity-40 bg-white/5 text-[var(--text-muted)]'
              )}
            >
              {m.label}
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold',
                m.badge === 'LIVE' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-[var(--text-muted)]'
              )}>
                {m.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Prompt */}
        <textarea
          data-testid="studio-image-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Decris l'image que tu veux generer... Ex: Un coucher de soleil sur Paris, style aquarelle, coleurs vives"
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--cyan)]/50 focus:ring-1 focus:ring-[var(--cyan)]/20"
        />

        <Button
          data-testid="studio-image-generate"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generation en cours...</>
          ) : (
            <><ImageIcon className="mr-2 h-4 w-4" /> Generer l&apos;image</>
          )}
        </Button>
      </Card>

      {/* Result */}
      {loading && (
        <Card className="p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </Card>
      )}
      {resultUrl && !loading && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Resultat</h3>
            <a
              href={resultUrl}
              download="image-akasha.png"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20"
            >
              <Download className="h-3.5 w-3.5" /> Telecharger
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Image generee"
            className="w-full rounded-xl object-cover"
          />
        </Card>
      )}

      {/* History */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Historique</h3>
        {historyLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-video w-full rounded-xl" />)}
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-10 w-10" />}
            title="Aucune image generee"
            description="Tes generations apparaitront ici"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {history.map(gen => (
              <div key={gen.id} className="group relative overflow-hidden rounded-xl">
                {gen.result_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gen.result_url}
                      alt={gen.prompt}
                      className="aspect-video w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                      <p className="line-clamp-2 text-xs text-white">{gen.prompt}</p>
                    </div>
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl bg-white/5">
                    <ImageIcon className="h-8 w-8 text-[var(--text-muted)]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
