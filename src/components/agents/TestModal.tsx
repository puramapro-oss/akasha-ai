'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, Loader2, Play } from 'lucide-react'
import type { PresetAgent } from '@/lib/preset-agents'
import type { DbAgent } from '@/types/chat'

export default function TestModal({
  agent,
  onClose,
}: {
  agent: PresetAgent | DbAgent
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleRun = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setResponse('')
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, prompt }),
      })
      const data = (await res.json()) as { response?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erreur')
      setResponse(data.response ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0e0e16] rounded-2xl border border-white/[0.08] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="test-agent-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ backgroundColor: agent.color + '22' }}
            >
              {agent.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Tester — {agent.name}</p>
              <p className="text-xs text-white/40">{agent.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Votre prompt</label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Entrez votre demande..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all resize-none"
              data-testid="agent-test-prompt"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
              }}
            />
            <p className="text-[10px] text-white/25 mt-1">Cmd+Entrée pour envoyer</p>
          </div>

          {response && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-white/40 mb-2 font-medium">Reponse</p>
              <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{response}</p>
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={loading || !prompt.trim()}
            data-testid="agent-test-submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {loading ? 'Execution...' : 'Tester'}
          </button>
        </div>
      </div>
    </div>
  )
}
