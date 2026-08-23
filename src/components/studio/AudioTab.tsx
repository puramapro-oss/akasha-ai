'use client'

import { useState } from 'react'
import { Music, Loader2, Download, Play } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { AudioSubTab, TTS_MODELS, TTS_VOICES } from './types'

export default function AudioTab() {
  const [subTab, setSubTab] = useState<AudioSubTab>('voice')
  const [voicePrompt, setVoicePrompt] = useState('')
  const [musicPrompt, setMusicPrompt] = useState('')
  const [voice, setVoice] = useState('alloy')
  const [ttsModel, setTtsModel] = useState<'openai-tts' | 'elevenlabs'>('openai-tts')
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [musicUrl, setMusicUrl] = useState<string | null>(null)

  const handleGenerateVoice = async () => {
    if (!voicePrompt.trim()) { toast.error('Entre du texte'); return }
    setLoading(true)
    setAudioUrl(null)
    try {
      const res = await fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: voicePrompt, model: ttsModel, voice }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Erreur de generation')
        return
      }
      setAudioUrl(data.url ?? null)
      toast.success('Audio genere !')
    } catch {
      toast.error('Service temporairement indisponible')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim()) { toast.error('Entre un prompt'); return }
    setLoading(true)
    setMusicUrl(null)
    try {
      const res = await fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, model: 'suno' }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Service temporairement indisponible')
        return
      }
      setMusicUrl(data.url ?? null)
      toast.success('Musique generee !')
    } catch {
      toast.error('Service temporairement indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('voice')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition-all',
            subTab === 'voice'
              ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
              : 'text-[var(--text-secondary)] hover:bg-white/5'
          )}
        >
          Voix (TTS)
        </button>
        <button
          onClick={() => setSubTab('music')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition-all',
            subTab === 'music'
              ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
              : 'text-[var(--text-secondary)] hover:bg-white/5'
          )}
        >
          Musique (Suno)
        </button>
      </div>

      {subTab === 'voice' && (
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Synthese vocale</h2>

          {/* TTS Model */}
          <div className="mb-4 flex gap-2">
            {TTS_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setTtsModel(m.id as 'openai-tts' | 'elevenlabs')}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-all',
                  m.id === ttsModel
                    ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
                    : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                )}
              >
                {m.label}
                <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-xs font-bold text-green-400">
                  {m.badge}
                </span>
              </button>
            ))}
          </div>

          {/* Voice selector */}
          <div className="mb-4">
            <label className="mb-2 block text-xs text-[var(--text-secondary)]">Voix</label>
            <div className="flex flex-wrap gap-2">
              {TTS_VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-sm transition-all',
                    v.id === voice
                      ? 'bg-[var(--purple)]/20 text-[var(--purple)] ring-1 ring-[var(--purple)]/40'
                      : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            data-testid="studio-audio-prompt"
            value={voicePrompt}
            onChange={e => setVoicePrompt(e.target.value)}
            placeholder="Entre le texte a transformer en audio..."
            rows={3}
            className="mb-4 w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--cyan)]/50 focus:ring-1 focus:ring-[var(--cyan)]/20"
          />

          <Button
            data-testid="studio-audio-generate"
            onClick={handleGenerateVoice}
            disabled={loading || !voicePrompt.trim()}
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generation en cours...</>
            ) : (
              <><Music className="mr-2 h-4 w-4" /> Generer l&apos;audio</>
            )}
          </Button>

          {loading && <Skeleton className="mt-4 h-16 w-full rounded-xl" />}

          {audioUrl && !loading && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-[var(--cyan)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Audio genere</span>
                </div>
                <a
                  href={audioUrl}
                  download="audio-akasha.mp3"
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" /> Telecharger
                </a>
              </div>
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
        </Card>
      )}

      {subTab === 'music' && (
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Generation musicale</h2>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Powered by Suno — decris le style musical et le theme.
          </p>

          <textarea
            value={musicPrompt}
            onChange={e => setMusicPrompt(e.target.value)}
            placeholder="Ex: Une melodie jazz douce avec piano et contrebasse, ambiance parisienne nocturne..."
            rows={3}
            className="mb-4 w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--cyan)]/50 focus:ring-1 focus:ring-[var(--cyan)]/20"
          />

          <Button
            onClick={handleGenerateMusic}
            disabled={loading || !musicPrompt.trim()}
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generation en cours...</>
            ) : (
              <><Music className="mr-2 h-4 w-4" /> Generer la musique</>
            )}
          </Button>

          {loading && <Skeleton className="mt-4 h-16 w-full rounded-xl" />}

          {musicUrl && !loading && (
            <div className="mt-4">
              <audio src={musicUrl} controls className="w-full" />
              <div className="mt-2 flex justify-end">
                <a
                  href={musicUrl}
                  download="music-akasha.mp3"
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" /> Telecharger
                </a>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
