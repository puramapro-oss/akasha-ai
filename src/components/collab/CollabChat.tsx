'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { getInitials, cn } from '@/lib/utils'
import type { CollabMessage } from '@/types/collab'

interface CollabChatProps {
  messages: CollabMessage[]
  userId?: string
  sending: boolean
  onSend: (content: string) => Promise<boolean>
}

export default function CollabChat({ messages, userId, sending, onSend }: CollabChatProps) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    const success = await onSend(text)
    if (!success) {
      setInput(text)
    }
  }

  return (
    <Card className="flex h-[60vh] flex-col">
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 ? (
          <EmptyState
            title="Aucun message"
            description="Lance la conversation avec ton equipe."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.user_id === userId
              return (
                <div
                  key={m.id}
                  className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}
                  data-testid={`collab-msg-${m.id}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-bold text-black">
                    {getInitials(m.display_name ?? null)}
                  </div>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                      mine
                        ? 'bg-[var(--cyan)]/20 border border-[var(--cyan)]/30'
                        : 'bg-white/5 border border-white/10'
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {m.display_name ?? 'Anonyme'}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[var(--text-primary)]">
                      {m.content}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ecris un message a ton equipe..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
            data-testid="collab-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            icon={
              sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )
            }
            data-testid="collab-send"
          >
            Envoyer
          </Button>
        </div>
      </div>
    </Card>
  )
}
