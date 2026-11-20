'use client'

import { useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import AIDisclosure from '@/lib/legal/components/AIDisclosure'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  open: boolean
  messages: ChatMessage[]
  input: string
  loading: boolean
  onClose: () => void
  onInputChange: (value: string) => void
  onSend: () => void
}

export default function ChatPanel({
  open,
  messages,
  input,
  loading,
  onClose,
  onInputChange,
  onSend,
}: ChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!open) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[500px] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-nebula)] shadow-2xl shadow-black/50">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Assistant AKASHA</p>
            <p className="text-xs text-[var(--green)]">En ligne</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Fermer le chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <AIDisclosure
        appName="AKASHA AI"
        className="border-b border-[var(--border)] px-4 py-1.5 text-center text-[10px] text-[var(--text-muted)]"
      />

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="mx-auto h-10 w-10 text-[var(--cyan)]" />
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
              Salut ! Comment puis-je t&apos;aider ?
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Pose-moi n&apos;importe quelle question sur AKASHA
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['Comment fonctionne le parrainage ?', 'Quels sont les plans ?', 'Comment retirer mes gains ?'].map(
                (q) => (
                  <button
                    key={q}
                    onClick={() => onInputChange(q)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
                  >
                    {q}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
              msg.role === 'user'
                ? 'ml-auto bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white'
                : 'bg-white/5 text-[var(--text-primary)]'
            )}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--cyan)]" />
            <span className="text-sm text-[var(--text-secondary)]">Reflexion en cours...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Chat Input */}
      <div className="border-t border-[var(--border)] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSend()
          }}
          className="flex items-center gap-2"
        >
          <input aria-label="Pose ta question..."
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Pose ta question..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] placeholder:text-[var(--text-secondary)]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-30"
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

export function ChatFloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white shadow-lg shadow-[var(--cyan)]/20 hover:scale-105 transition-transform"
      aria-label="Ouvrir l'assistant"
    >
      <MessageSquare className="h-6 w-6" />
    </button>
  )
}
