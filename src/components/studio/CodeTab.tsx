'use client'

import { useState } from 'react'
import { Code2, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { CODE_LANGUAGES } from './types'
import { CopyButton } from './StudioUtils'

export default function CodeTab() {
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
