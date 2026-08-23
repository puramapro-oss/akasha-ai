import { Play } from 'lucide-react'
import type { PresetAgent } from '@/lib/preset-agents'

export default function PresetAgentCard({ agent, onTest }: { agent: PresetAgent; onTest: (a: PresetAgent) => void }) {
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
