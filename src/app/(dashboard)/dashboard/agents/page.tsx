'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X, Loader2, Play, Power, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PRESET_AGENTS, type PresetAgent } from '@/lib/preset-agents'
import { cn } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbAgent {
  id: string
  name: string
  description: string
  icon: string
  color: string
  system_prompt: string
  category: string
  is_active: boolean
  creator_id: string
}

// ─── Test Modal ───────────────────────────────────────────────────────────────

function TestModal({
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
      const data = await res.json() as { response?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erreur')
      setResponse(data.response ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors">
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

// ─── Create Agent Form ────────────────────────────────────────────────────────

const EMOJI_OPTIONS = ['🤖', '⚡', '🎯', '🔮', '🧠', '🛠️', '📊', '🚀', '💡', '🎨', '🔍', '📝', '🎧', '📧', '📱', '💻', '🌐', '🔥', '✨', '🎵']
const COLOR_OPTIONS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#0ea5e9', '#d97757']

function CreateAgentForm({
  onSave,
  onCancel,
}: {
  onSave: (agent: DbAgent) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('🤖')
  const [color, setColor] = useState('#00d4ff')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error('Nom et prompt systeme requis')
      return
    }
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('agents')
        .insert({
          creator_id: user.id,
          name: name.trim(),
          description: description.trim() || 'Mon agent custom',
          icon,
          color,
          system_prompt: systemPrompt.trim(),
          category: 'custom',
          is_active: true,
          is_public: false,
          is_verified: false,
          model: 'claude-sonnet-4',
        })
        .select()
        .single()

      if (error) throw error
      toast.success('Agent cree avec succes !')
      onSave(data as DbAgent)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur creation agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--cyan)]/30 bg-[var(--cyan)]/5 p-5 space-y-4" data-testid="create-agent-form">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--cyan)]" />
          Creer un agent custom
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Icon + Color row */}
      <div className="flex gap-3">
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker((p) => !p)}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border border-white/[0.08] bg-white/5 hover:bg-white/10 transition-colors"
            style={{ borderColor: color + '44' }}
            data-testid="emoji-picker-toggle"
          >
            {icon}
          </button>
          {showEmojiPicker && (
            <div className="absolute top-14 left-0 z-50 p-3 rounded-xl bg-[#141420] border border-white/[0.08] shadow-xl grid grid-cols-5 gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => { setIcon(e); setShowEmojiPicker(false) }}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-lg transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1">
          <label className="text-xs text-white/50 mb-1.5 block">Couleur</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-all hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Nom de l&apos;agent *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mon super agent"
          maxLength={50}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all"
          data-testid="agent-name-input"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce que fait votre agent..."
          maxLength={120}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all"
          data-testid="agent-description-input"
        />
      </div>

      {/* System prompt */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Prompt systeme *</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Tu es un expert en... Tu dois toujours..."
          rows={5}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all resize-none"
          data-testid="agent-system-prompt-input"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-medium hover:bg-white/10 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !name.trim() || !systemPrompt.trim()}
          data-testid="save-agent-button"
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sauvegarder
        </button>
      </div>
    </div>
  )
}

// ─── Preset Agent Card ────────────────────────────────────────────────────────

function PresetAgentCard({ agent, onTest }: { agent: PresetAgent; onTest: (a: PresetAgent) => void }) {
  return (
    <div
      data-testid={`preset-agent-card-${agent.id}`}
      className="group flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06] transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: agent.color + '22', border: `1px solid ${agent.color}33` }}
        >
          {agent.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
          <p className="text-xs text-white/50 leading-relaxed line-clamp-2 mt-0.5">{agent.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 capitalize">{agent.category}</span>
        <button
          onClick={() => onTest(agent)}
          data-testid={`test-preset-agent-${agent.id}`}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: agent.color + '22', color: agent.color, border: `1px solid ${agent.color}33` }}
        >
          <Play className="h-3 w-3" />
          Tester
        </button>
      </div>
    </div>
  )
}

// ─── Custom Agent Card ────────────────────────────────────────────────────────

function CustomAgentCard({
  agent,
  onTest,
  onToggle,
}: {
  agent: DbAgent
  onTest: (a: DbAgent) => void
  onToggle: (id: string, active: boolean) => void
}) {
  return (
    <div
      data-testid={`custom-agent-card-${agent.id}`}
      className={cn(
        'group flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200',
        agent.is_active
          ? 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06]'
          : 'bg-white/[0.01] border-white/[0.03] opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{
            backgroundColor: agent.color + '22',
            border: `1px solid ${agent.color}33`,
          }}
        >
          {agent.icon || '🤖'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
          <p className="text-xs text-white/50 leading-relaxed line-clamp-2 mt-0.5">{agent.description}</p>
        </div>
        {/* Active toggle */}
        <button
          onClick={() => onToggle(agent.id, !agent.is_active)}
          data-testid={`toggle-agent-${agent.id}`}
          className={cn(
            'flex-shrink-0 w-8 h-5 rounded-full transition-all duration-200 relative',
            agent.is_active ? 'bg-emerald-500' : 'bg-white/20'
          )}
          title={agent.is_active ? 'Desactiver' : 'Activer'}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
              agent.is_active ? 'left-3' : 'left-0.5'
            )}
          />
        </button>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full',
            agent.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'
          )}
        >
          {agent.is_active ? 'Actif' : 'Inactif'}
        </span>
        <button
          onClick={() => onTest(agent)}
          disabled={!agent.is_active}
          data-testid={`test-custom-agent-${agent.id}`}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: agent.color + '22', color: agent.color, border: `1px solid ${agent.color}33` }}
        >
          <Play className="h-3 w-3" />
          Tester
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const supabase = createClient()
  const { user, loading: authLoading } = useAuth()

  const [customAgents, setCustomAgents] = useState<DbAgent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [testingAgent, setTestingAgent] = useState<PresetAgent | DbAgent | null>(null)

  const fetchCustomAgents = useCallback(async () => {
    if (!user) return
    setLoadingAgents(true)
    try {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
      setCustomAgents((data ?? []) as DbAgent[])
    } finally {
      setLoadingAgents(false)
    }
  }, [user, supabase])

  useEffect(() => {
    if (!authLoading && user) fetchCustomAgents()
    else if (!authLoading) setLoadingAgents(false)
  }, [authLoading, user, fetchCustomAgents])

  const handleToggleAgent = async (id: string, active: boolean) => {
    setCustomAgents((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: active } : a)))
    const { error } = await supabase.from('agents').update({ is_active: active }).eq('id', id)
    if (error) {
      toast.error('Erreur mise a jour')
      setCustomAgents((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !active } : a)))
    }
  }

  const handleAgentSaved = (agent: DbAgent) => {
    setCustomAgents((prev) => [agent, ...prev])
    setShowCreateForm(false)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes Agents</h1>
          <p className="text-sm text-white/50 mt-0.5">Agents IA autonomes configures pour vos taches</p>
        </div>
        <button
          onClick={() => setShowCreateForm((p) => !p)}
          data-testid="create-agent-button"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Creer mon agent</span>
          <span className="sm:hidden">Creer</span>
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateAgentForm
          onSave={handleAgentSaved}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Preset agents section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-[var(--cyan)]" />
          <h2 className="text-base font-semibold text-white">Agents pre-configures</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cyan)]/10 text-[var(--cyan)]">{PRESET_AGENTS.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {PRESET_AGENTS.map((agent) => (
            <PresetAgentCard key={agent.id} agent={agent} onTest={setTestingAgent} />
          ))}
        </div>
      </section>

      {/* Custom agents section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Power className="h-4 w-4 text-[var(--purple)]" />
          <h2 className="text-base font-semibold text-white">Mes agents customs</h2>
          {!loadingAgents && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--purple)]/10 text-[var(--purple)]">
              {customAgents.length}
            </span>
          )}
        </div>

        {loadingAgents ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
        ) : customAgents.length === 0 ? (
          <div data-testid="custom-agents-empty">
            <EmptyState
              title="Aucun agent custom"
              description='Creez votre premier agent avec le bouton "Creer mon agent".'
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {customAgents.map((agent) => (
              <CustomAgentCard
                key={agent.id}
                agent={agent}
                onTest={setTestingAgent}
                onToggle={handleToggleAgent}
              />
            ))}
          </div>
        )}
      </section>

      {/* Test Modal */}
      {testingAgent && (
        <TestModal agent={testingAgent} onClose={() => setTestingAgent(null)} />
      )}
    </div>
  )
}
