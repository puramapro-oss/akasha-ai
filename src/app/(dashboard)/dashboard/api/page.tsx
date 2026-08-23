'use client'

import { useState, useEffect, useCallback } from 'react'
import { Key, Copy, RefreshCw, EyeOff, Terminal, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { copyToClipboard } from '@/lib/utils'

interface ApiKey {
  id: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/api/v1/chat',
    desc: 'Envoie un message a AKASHA IA',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/chat \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Bonjour AKASHA !", "model": "claude-sonnet-4"}'`,
  },
  {
    method: 'POST',
    path: '/api/v1/generate/image',
    desc: 'Genere une image avec FLUX',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/generate/image \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Un chat astronaute dans l\\'espace", "style": "photorealistic"}'`,
  },
  {
    method: 'POST',
    path: '/api/v1/generate/audio',
    desc: 'Convertit du texte en audio',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/generate/audio \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Bonjour depuis AKASHA", "voice": "nova"}'`,
  },
]

export default function ApiConsolePage() {
  const { user, profile } = useAuth()
  const [apiKey, setApiKey] = useState<ApiKey | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showFullKey, setShowFullKey] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [usageCount, setUsageCount] = useState(0)

  const supabase = createClient()

  const fetchApiKey = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('api_keys')
      .select('id, key_prefix, created_at, last_used_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setApiKey(data as ApiKey ?? null)

    // Fetch usage count for this month
    const monthStart = new Date()
    monthStart.setDate(1)
    const { count } = await supabase
      .from('api_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart.toISOString())

    setUsageCount(count ?? 0)
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchApiKey()
  }, [fetchApiKey])

  const handleGenerate = async (regen = false) => {
    if (!user) return
    setGenerating(true)

    // Deactivate old key if regenerating
    if (regen && apiKey) {
      await supabase.from('api_keys').update({ is_active: false }).eq('id', apiKey.id)
    }

    try {
      const res = await fetch('/api/admin/api-keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')

      setShowFullKey(data.key)
      toast.success(regen ? 'Cle regeneree !' : 'Cle API generee !')
      await fetchApiKey()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la generation')
    }
    setGenerating(false)
    setShowConfirm(false)
  }

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text)
    toast[ok ? 'success' : 'error'](ok ? 'Copie !' : 'Erreur de copie')
  }

  const isPro = profile?.plan
    ? ['complete_pro', 'complete_max', 'build_pro', 'build_max', 'automate_pro', 'automate_max'].includes(profile.plan)
    : false

  const displayKey = showFullKey ?? (apiKey ? `${apiKey.key_prefix}${'•'.repeat(32)}` : null)

  return (
    <div className="flex flex-col gap-6" data-testid="api-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            API Console
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Integre AKASHA dans tes apps
          </p>
        </div>
        {!isPro && (
          <Badge variant="gold" className="text-xs">
            COMPLET Pro ou Max requis
          </Badge>
        )}
      </div>

      {/* API Key Card */}
      <Card className="p-6" data-testid="api-key-section">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-[var(--cyan)]" />
          <h2 className="font-semibold text-[var(--text-primary)]">Cle API</h2>
          {showFullKey && (
            <Badge variant="green" className="ml-auto">
              Affichee une seule fois
            </Badge>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : displayKey ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3">
              <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm text-[var(--cyan)]">
                {displayKey}
              </code>
              <button
                onClick={() => handleCopy(displayKey)}
                className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                data-testid="copy-key-btn"
              >
                <Copy className="h-4 w-4" />
              </button>
              {showFullKey && (
                <button
                  onClick={() => setShowFullKey(null)}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              )}
            </div>

            {showFullKey && (
              <div className="flex items-start gap-2 rounded-xl bg-[var(--gold)]/10 p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--gold)] mt-0.5" />
                <p className="text-xs text-[var(--gold)]">
                  Copie cette cle maintenant — elle ne sera plus affichee apres avoir quitte cette page.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowConfirm(true)}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                data-testid="regen-key-btn"
              >
                Regenerer
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Key className="h-10 w-10 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">Aucune cle API generee</p>
            <Button
              onClick={() => handleGenerate(false)}
              loading={generating}
              icon={<Key className="h-4 w-4" />}
              data-testid="generate-key-btn"
            >
              Generer une cle
            </Button>
          </div>
        )}
      </Card>

      {/* Usage Stats */}
      <Card className="flex items-center gap-4 p-5" data-testid="api-usage">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--purple)]/10">
          <Terminal className="h-5 w-5 text-[var(--purple)]" />
        </div>
        <div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{usageCount}</p>
          <p className="text-xs text-[var(--text-muted)]">Appels API ce mois</p>
        </div>
      </Card>

      {/* Documentation */}
      <section data-testid="api-docs">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Documentation
        </h2>
        <div className="flex flex-col gap-4">
          {ENDPOINTS.map((ep) => (
            <Card key={ep.path} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="cyan">{ep.method}</Badge>
                <code className="font-mono text-sm text-[var(--text-primary)]">{ep.path}</code>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">{ep.desc}</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-xl bg-white/5 p-4 text-xs font-mono text-[var(--text-secondary)] leading-relaxed">
                  <code>
                    {ep.curl(showFullKey ?? (apiKey ? `${apiKey.key_prefix}...` : 'YOUR_API_KEY'))}
                  </code>
                </pre>
                <button
                  onClick={() => handleCopy(ep.curl(showFullKey ?? (apiKey ? `${apiKey.key_prefix}...` : 'YOUR_API_KEY')))}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                  data-testid={`copy-curl-${ep.path.replace(/\//g, '-')}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Confirm Regen Modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowConfirm(false)}
        >
          <Card className="w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[var(--text-primary)]">Regenerer la cle ?</h2>
              <button onClick={() => setShowConfirm(false)}>
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              L&apos;ancienne cle sera invalidee immediatement. Toutes les integrations utilisant cette cle
              cesseront de fonctionner.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => handleGenerate(true)}
                loading={generating}
                data-testid="confirm-regen"
              >
                Regenerer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
