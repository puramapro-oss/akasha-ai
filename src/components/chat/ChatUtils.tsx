'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AI_MODELS, canUseAkashaModel, type AkashaModelId } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function ModelSelector({
  selected,
  onSelect,
  plan,
  disabled = false,
}: {
  selected: AkashaModelId | null
  onSelect: (id: AkashaModelId) => void
  plan?: string | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const model = AI_MODELS.find(m => m.id === selected)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(m: typeof AI_MODELS[number]) {
    if (disabled || !canUseAkashaModel(m.id, plan)) return
    onSelect(m.id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label="Choisir le modèle IA"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-sm font-medium hover:bg-white/10 transition-colors border border-white/[0.06]"
        data-testid="model-selector"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: model?.color ?? '#94a3b8' }}
        />
        {model?.name ?? 'Choisir un modèle'}
        {model && <span className="rounded px-1 py-0.5 text-[10px] font-bold" style={{ backgroundColor: model.color + '22', color: model.color }}>
          {model.badge}
        </span>}
        <ChevronDown className={cn('h-3 w-3 transition-transform text-[var(--text-muted)]', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-2xl border border-white/[0.06] bg-[#13141a] shadow-xl">
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              type="button"
              disabled={disabled || !canUseAkashaModel(m.id, plan)}
              aria-pressed={m.id === selected}
              onClick={() => handleSelect(m)}
              className={cn(
                'flex w-full flex-col gap-1 px-4 py-3 text-sm hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left first:rounded-t-2xl last:rounded-b-2xl',
                m.id === selected && 'bg-white/[0.04]'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                <span className="flex-1 font-medium">{m.name}</span>
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: m.color + '22', color: m.color }}
                >
                  {m.badge}
                </span>
              </div>
              <p className="ml-5 text-[11px] text-[var(--text-muted)]">{m.description}</p>
              {!canUseAkashaModel(m.id, plan) && <p className="ml-5 text-[11px]">Indisponible avec ton accès actuel</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-bold text-black">
          A
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-[var(--cyan)]/20 border border-[var(--cyan)]/30 text-[var(--text-primary)] rounded-tr-sm'
            : 'glass border border-white/[0.06] text-[var(--text-primary)] rounded-tl-sm'
        )}
      >
        {msg.streaming && msg.content === '' ? (
          <div className="flex gap-1 items-center h-5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] animate-bounce" />
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Conversation Item ────────────────────────────────────────────────────────

export function ConvItem({
  conv,
  active,
  onClick,
}: {
  conv: Conversation
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl px-3 py-2.5 text-left transition-colors group hover:bg-white/5',
        active && 'bg-white/[0.06]'
      )}
      data-testid="conv-item"
    >
      <p className={cn('truncate text-sm font-medium', active ? 'text-[var(--cyan)]' : 'text-[var(--text-secondary)]')}>
        {conv.title ?? 'Nouvelle conversation'}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: fr })}
      </p>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

