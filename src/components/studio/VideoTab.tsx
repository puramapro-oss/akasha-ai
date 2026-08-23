'use client'

import { useState } from 'react'
import { Video, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'

export default function VideoTab() {
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(4)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ url: string | null; status: string } | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Entre un prompt'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration }),
      })
      const data = (await res.json()) as { url?: string; status?: string; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Erreur de generation')
        return
      }
      setResult({ url: data.url ?? null, status: data.status ?? 'pending' })
      toast.success(data.status === 'ready' ? 'Video generee !' : 'Generation en cours...')
    } catch {
      toast.error('Service temporairement indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Generer une video</h2>
          <span className="rounded-lg bg-[var(--cyan)]/10 px-2 py-0.5 text-xs text-[var(--cyan)]">Beta</span>
        </div>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          La generation video LTX est en beta. Les resultats peuvent prendre jusqu&apos;a 2 minutes.
        </p>

        <textarea
          data-testid="studio-video-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Decris la video... Ex: Une vague qui s'ecrase sur une plage au coucher du soleil, camera aerienne"
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--cyan)]/50 focus:ring-1 focus:ring-[var(--cyan)]/20"
        />

        {/* Duration */}
        <div className="mb-4">
          <label className="mb-2 block text-xs text-[var(--text-secondary)]">
            Duree: <span className="font-semibold text-[var(--text-primary)]">{duration}s</span>
          </label>
          <input
            type="range"
            min={2}
            max={10}
            step={1}
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full accent-[var(--cyan)]"
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--text-muted)]">
            <span>2s</span><span>10s</span>
          </div>
        </div>

        <Button
          data-testid="studio-video-generate"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generation en cours...</>
          ) : (
            <><Video className="mr-2 h-4 w-4" /> Generer la video</>
          )}
        </Button>
      </Card>

      {loading && (
        <Card className="p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </Card>
      )}

      {result && !loading && (
        <Card className="p-6">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Resultat</h3>
          {result.status === 'pending' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--cyan)]" />
              <p className="text-sm text-[var(--text-secondary)]">Video en cours de generation...</p>
            </div>
          ) : result.url ? (
            <div>
              <video
                src={result.url}
                controls
                className="w-full rounded-xl"
              />
              <div className="mt-3 flex gap-2">
                <a
                  href={result.url}
                  download="video-akasha.mp4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" /> Telecharger
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <Video className="h-10 w-10 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-secondary)]">Video non disponible</p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
