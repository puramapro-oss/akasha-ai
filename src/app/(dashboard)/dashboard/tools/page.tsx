'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ExternalLink, Zap, HardDrive } from 'lucide-react'
import { TOOLS, CATEGORIES, type Category } from '@/lib/tools-catalog'
import { cn } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'

// ─── Badge component ─────────────────────────────────────────────────────────

function BadgeChip({ badge }: { badge: 'LIVE' | 'LINK' | 'LOCAL' }) {
  const styles = {
    LIVE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    LINK: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
    LOCAL: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  }
  const icons = {
    LIVE: <Zap className="h-2.5 w-2.5" />,
    LINK: <ExternalLink className="h-2.5 w-2.5" />,
    LOCAL: <HardDrive className="h-2.5 w-2.5" />,
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider', styles[badge])}>
      {icons[badge]}
      {badge}
    </span>
  )
}

// ─── Category label map ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  text: 'Texte',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  research: 'Recherche',
  automation: 'Automatisation',
}

// ─── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: (typeof TOOLS)[number] }) {
  const router = useRouter()

  const handleAction = () => {
    if (tool.badge === 'LINK' && tool.url) {
      window.open(tool.url, '_blank', 'noopener,noreferrer')
    } else if (tool.route) {
      router.push(tool.route)
    }
  }

  const initial = tool.name.charAt(0).toUpperCase()

  return (
    <div
      data-testid={`tool-card-${tool.id}`}
      className="group relative flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06] transition-all duration-200"
    >
      {/* Icon */}
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: tool.color + '33', border: `1px solid ${tool.color}44` }}
        >
          <span style={{ color: tool.color }}>{initial}</span>
        </div>
        <BadgeChip badge={tool.badge} />
      </div>

      {/* Name + desc */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-white leading-snug mb-0.5">{tool.name}</h3>
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{tool.description}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 capitalize">
          {CATEGORY_LABELS[tool.category] ?? tool.category}
        </span>
        <button
          onClick={handleAction}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all duration-200 hover:opacity-90 active:scale-95"
          style={{ backgroundColor: tool.color + '22', color: tool.color, border: `1px solid ${tool.color}33` }}
        >
          {tool.badge === 'LINK' ? (
            <>Ouvrir <ExternalLink className="h-3 w-3" /></>
          ) : (
            <>Lancer <span>→</span></>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')

  const filtered = useMemo(() => {
    return TOOLS.filter((t) => {
      const matchSearch =
        search.trim() === '' ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      const matchCat = category === 'all' || t.category === category
      return matchSearch && matchCat
    })
  }, [search, category])

  const liveCount = TOOLS.filter((t) => t.badge === 'LIVE' || t.badge === 'LOCAL').length
  const linkCount = TOOLS.filter((t) => t.badge === 'LINK').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Outils IA</h1>
        <p className="text-sm text-white/50">
          {TOOLS.length} outils reunis — <span className="text-emerald-400">{liveCount} LIVE</span> · <span className="text-sky-400">{linkCount} liens externes</span>
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input aria-label="Rechercher un outil..."
            type="text"
            placeholder="Rechercher un outil..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 focus:bg-white/[0.07] transition-all"
            data-testid="tools-search"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id as Category)}
              data-testid={`category-pill-${cat.id}`}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                category === cat.id
                  ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] border border-[var(--cyan)]/40'
                  : 'bg-white/5 text-white/50 border border-white/[0.06] hover:bg-white/10 hover:text-white/70'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {filtered.length > 0 && (
        <p className="text-xs text-white/30">
          {filtered.length} outil{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Tools Grid */}
      {filtered.length === 0 ? (
        <div data-testid="tools-empty">
          <EmptyState
            title="Aucun outil trouvé"
            description="Essayez un autre terme ou une autre categorie."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="tools-grid">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
