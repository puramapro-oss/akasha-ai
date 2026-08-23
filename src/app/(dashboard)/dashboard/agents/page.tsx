'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Power, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PRESET_AGENTS, type PresetAgent } from '@/lib/preset-agents'
import EmptyState from '@/components/ui/EmptyState'
import TestModal from '@/components/agents/TestModal'
import CreateAgentForm from '@/components/agents/CreateAgentForm'
import PresetAgentCard from '@/components/agents/PresetAgentCard'
import CustomAgentCard from '@/components/agents/CustomAgentCard'
import type { DbAgent } from '@/types/chat'

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
      {showCreateForm && <CreateAgentForm onSave={handleAgentSaved} onCancel={() => setShowCreateForm(false)} />}

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
              <CustomAgentCard key={agent.id} agent={agent} onTest={setTestingAgent} onToggle={handleToggleAgent} />
            ))}
          </div>
        )}
      </section>

      {/* Test Modal */}
      {testingAgent && <TestModal agent={testingAgent} onClose={() => setTestingAgent(null)} />}
    </div>
  )
}
