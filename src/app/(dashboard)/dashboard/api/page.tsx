'use client'

import { useState, useEffect, useCallback } from 'react'
import { Key, Copy, RefreshCw, EyeOff, Terminal, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { copyToClipboard } from '@/lib/utils'
import ConfirmRegenModal from '@/components/api/ConfirmRegenModal'
import ApiDocumentation from '@/components/api/ApiDocumentation'

interface ApiKey {
  id: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

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
      <ApiDocumentation
        apiKey={showFullKey ?? (apiKey ? `${apiKey.key_prefix}...` : null)}
        onCopy={handleCopy}
      />

      {/* Confirm Regen Modal */}
      <ConfirmRegenModal
        open={showConfirm}
        loading={generating}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => handleGenerate(true)}
      />
    </div>
  )
}
