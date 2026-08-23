import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DbAgent } from '@/types/chat'

export default function CustomAgentCard({
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
