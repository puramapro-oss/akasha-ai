'use client'

import { useState, useEffect, useCallback } from 'react'
import { Image as ImageIcon, Video, Music, Code2, Download, Copy, Check, Loader2, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'

// --- Types ---
interface Generation {
  id: string
  type: string
  prompt: string
  model: string | null
  result_url: string | null
  result_text: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type StudioTab = 'image' | 'video' | 'audio' | 'code'
type AudioSubTab = 'voice' | 'music'

const TABS: { id: StudioTab; label: string; icon: React.ElementType }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'code', label: 'Code', icon: Code2 },
]

const IMAGE_MODELS = [
  { id: 'flux', label: 'FLUX Pro', badge: 'LIVE', available: true },
  { id: 'dalle', label: 'DALL-E 3', badge: 'LIVE', available: true },
  { id: 'imagen', label: 'Pollinations Flux', badge: 'LIVE', available: true },
]

const CODE_LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'SQL',
  'Java', 'C++', 'C#', 'PHP', 'Swift', 'Kotlin',
]

const TTS_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'nova', label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
]

const TTS_MODELS = [
  { id: 'openai-tts', label: 'OpenAI TTS', badge: 'LIVE', available: true },
  { id: 'elevenlabs', label: 'ElevenLabs', badge: 'LIVE', available: true },
]

// --- Subcomponents ---
function TabPill({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
          : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copie !')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20 hover:text-[var(--text-primary)]"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copie !' : 'Copier'}
    </button>
  )
}

// --- Image Tab ---
function ImageTab() {
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

// --- Video Tab ---
function VideoTab() {
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

// --- Audio Tab ---
function AudioTab() {
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
              { }
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
              { }
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

// --- Code Tab ---
function CodeTab() {
  const [prompt, setPrompt] = useState('')
  const [language, setLanguage] = useState('TypeScript')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Decris le code a generer'); return }
    setLoading(true)
    setCode(null)
    try {
      const res = await fetch('/api/generate/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, language }),
      })
      const data = (await res.json()) as { code?: string; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Erreur de generation')
        return
      }
      setCode(data.code ?? null)
      toast.success('Code genere !')
    } catch {
      toast.error('Service temporairement indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Generer du code</h2>

        {/* Language selector */}
        <div className="mb-4">
          <label className="mb-2 block text-xs text-[var(--text-secondary)]">Langage</label>
          <div className="flex flex-wrap gap-2">
            {CODE_LANGUAGES.map(lang => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm transition-all',
                  lang === language
                    ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
                    : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <textarea
          data-testid="studio-code-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={`Decris le code ${language} que tu veux generer... Ex: Une fonction qui trie un tableau d'objets par date`}
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--cyan)]/50 focus:ring-1 focus:ring-[var(--cyan)]/20"
        />

        <Button
          data-testid="studio-code-generate"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generation en cours...</>
          ) : (
            <><Code2 className="mr-2 h-4 w-4" /> Generer le code</>
          )}
        </Button>
      </Card>

      {loading && (
        <Card className="p-6">
          <Skeleton className="mb-2 h-4 w-32 rounded" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </Card>
      )}

      {code && !loading && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-[var(--cyan)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">{language}</span>
            </div>
            <div className="flex gap-2">
              <CopyButton text={code} />
              <button
                onClick={() => { setCode(null); setPrompt('') }}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Nouveau
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl bg-[#0d1117] p-4">
            <pre className="text-sm leading-relaxed">
              <code className="text-[var(--text-primary)] font-mono">{code}</code>
            </pre>
          </div>
        </Card>
      )}
    </div>
  )
}

// --- Main Studio Page ---
export default function StudioPage() {
  const [activeTab, setActiveTab] = useState<StudioTab>('image')

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Studio{' '}
          <span className="gradient-text font-[family-name:var(--font-display)]">Creatif</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Genere des images, videos, audios et du code avec l&apos;IA
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.02] p-2">
        {TABS.map(tab => (
          <TabPill
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'image' && <ImageTab />}
      {activeTab === 'video' && <VideoTab />}
      {activeTab === 'audio' && <AudioTab />}
      {activeTab === 'code' && <CodeTab />}
    </div>
  )
}
