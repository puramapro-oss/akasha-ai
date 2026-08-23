'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Plus, Search, MessageSquare, ChevronDown, Mic, MicOff, Loader2, Bot } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { AI_MODELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import AIDisclosure from '@/lib/legal/components/AIDisclosure'
import type { Conversation, Message } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface QuotaInfo {
  plan: string
  limit: number
  used: number
  remaining: number
  isSuperAdmin: boolean
}

// Minimal SpeechRecognition typing — Web Speech API is browser-native (Chrome, Edge, Safari)
interface SpeechRecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEvent extends Event {
  results: { length: number; [index: number]: SpeechRecognitionResult }
  resultIndex: number
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

// ─── Model Selector ───────────────────────────────────────────────────────────

function ModelSelector({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const model = AI_MODELS.find(m => m.id === selected) ?? AI_MODELS[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(m: typeof AI_MODELS[number]) {
    onSelect(m.id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-sm font-medium hover:bg-white/10 transition-colors border border-white/[0.06]"
        data-testid="model-selector"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: model.color }}
        />
        {model.name}
        <span className="rounded px-1 py-0.5 text-[10px] font-bold" style={{ backgroundColor: model.color + '22', color: model.color }}>
          {model.badge}
        </span>
        <ChevronDown className={cn('h-3 w-3 transition-transform text-[var(--text-muted)]', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-2xl border border-white/[0.06] bg-[#13141a] shadow-xl">
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              className={cn(
                'flex w-full flex-col gap-1 px-4 py-3 text-sm hover:bg-white/5 transition-colors text-left first:rounded-t-2xl last:rounded-b-2xl',
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
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
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

function ConvItem({
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

export default function ChatPage() {
  const { user } = useAuth()
  const supabase = createClient()

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convsLoading, setConvsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)

  // Input
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('akasha-sonnet')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Quota
  const [quota, setQuota] = useState<QuotaInfo | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch conversations ──────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) return
    setConvsLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(50)
      setConversations((data as Conversation[]) ?? [])
    } catch {
      // graceful
    } finally {
      setConvsLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Fetch quota ──────────────────────────────────────────────────────────────
  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/quota/check')
      if (res.ok) {
        const data = await res.json() as QuotaInfo
        setQuota(data)
      }
    } catch {
      // graceful
    }
  }, [])

  useEffect(() => {
    fetchQuota()
  }, [fetchQuota])

  // ── Load conversation messages ────────────────────────────────────────────────
  const loadConversation = useCallback(async (convId: string) => {
    setActiveConvId(convId)
    setMsgsLoading(true)
    setMessages([])
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
      const msgs = (data as Message[] ?? []).map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
      setMessages(msgs)
    } catch {
      toast.error('Impossible de charger la conversation')
    } finally {
      setMsgsLoading(false)
    }
  }, [supabase])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-resize textarea ──────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [input])

  // ── New conversation ──────────────────────────────────────────────────────────
  function handleNewConversation() {
    setActiveConvId(null)
    setMessages([])
    setInput('')
    textareaRef.current?.focus()
  }

  // ── Send message ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
    }
    const assistantMsg: ChatMessage = {
      id: `tmp-ass-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setSending(true)

    // Build messages history for API
    const history: { role: 'user' | 'assistant'; content: string }[] = [
      ...messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          conversationId: activeConvId ?? undefined,
          model: selectedModel,
        }),
      })

      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        if (res.status === 429) {
          toast.error('Quota journalier atteint. Passe à un plan supérieur pour continuer.')
        } else {
          toast.error(errData.error ?? 'Erreur lors de l\'envoi')
        }
        setMessages(prev => prev.filter(m => m.id !== assistantMsg.id))
        return
      }

      if (!res.body) {
        toast.error('Pas de réponse du serveur')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''
      let newConvId: string | null = activeConvId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue

          try {
            const parsed = JSON.parse(raw) as { text?: string; conversationId?: string; error?: string }
            if (parsed.error) {
              toast.error(parsed.error)
              break
            }
            if (parsed.conversationId) {
              newConvId = parsed.conversationId
              setActiveConvId(parsed.conversationId)
            }
            if (parsed.text) {
              fullText += parsed.text
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: fullText }
                    : m
                )
              )
            }
          } catch {
            // skip malformed
          }
        }
      }

      // Mark streaming done
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, streaming: false }
            : m
        )
      )

      // Refresh conversations
      if (newConvId && !activeConvId) {
        await fetchConversations()
      } else {
        await fetchConversations()
      }
      await fetchQuota()

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau'
      toast.error(msg)
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id && m.id !== userMsg.id))
    } finally {
      setSending(false)
    }
  }, [input, sending, messages, activeConvId, fetchConversations, fetchQuota, selectedModel])

  // ── Voice input (Web Speech API — native browser, gratuit, hors-ligne sur Safari) ──
  const toggleVoice = useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      toast.error('Reconnaissance vocale non supportee par ce navigateur (essaie Chrome, Edge ou Safari)')
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const recog = new Ctor()
    recog.lang = 'fr-FR'
    recog.continuous = false
    recog.interimResults = true
    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (final) setInput(prev => (prev + ' ' + final).trim())
      else if (interim) setInput(prev => (prev ? prev + ' ' : '') + interim)
    }
    recog.onerror = () => {
      setListening(false)
      toast.error('Erreur reconnaissance vocale')
    }
    recog.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recog
    try {
      recog.start()
      setListening(true)
      toast.success('Parle maintenant — clique a nouveau pour arreter')
    } catch {
      setListening(false)
      toast.error('Impossible de demarrer le micro')
    }
  }, [listening])

  // ── Key handler ───────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Filtered conversations ────────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c =>
    !searchQuery || (c.title ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem-2rem)] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d0d12] lg:h-[calc(100vh-4rem-4rem)]">
      {/* ── Left sidebar ────────────────────────────────────────────────────── */}
      <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-white/[0.06] lg:flex">
        {/* New conversation */}
        <div className="p-3">
          <button
            onClick={handleNewConversation}
            className="flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            data-testid="new-conversation"
          >
            <Plus className="h-4 w-4" />
            Nouvelle conversation
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 border border-white/[0.04]">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 scrollbar-thin">
          {convsLoading ? (
            <div className="flex flex-col gap-1.5 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : filteredConvs.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="Aucune conversation"
              description="Lance ta première conversation"
            />
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {filteredConvs.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeConvId}
                  onClick={() => loadConversation(conv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main chat area ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Mobile new conv */}
            <button
              onClick={handleNewConversation}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors lg:hidden"
              data-testid="mobile-new-conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            <ModelSelector selected={selectedModel} onSelect={setSelectedModel} />
          </div>

          {/* Quota indicator */}
          {quota && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              {quota.isSuperAdmin ? (
                <span className="text-[var(--cyan)]">∞ illimité</span>
              ) : (
                <>
                  <span className={cn(
                    'font-medium',
                    quota.remaining === 0 ? 'text-red-400' : quota.remaining < 5 ? 'text-yellow-400' : 'text-[var(--text-muted)]'
                  )}>
                    {quota.used}
                  </span>
                  <span>/</span>
                  <span>{quota.limit} requêtes aujourd&apos;hui</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
          {msgsLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className={cn('h-16 rounded-2xl', i % 2 === 0 ? 'w-3/4' : 'ml-auto w-2/3')} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-12 w-12 text-[var(--cyan)]" />}
              title="Commence une conversation"
              description="Pose n'importe quelle question à AKASHA, ton assistant IA multi-expert."
              action={
                <button
                  onClick={() => textareaRef.current?.focus()}
                  className="mt-2 rounded-xl bg-[var(--cyan)]/10 px-4 py-2 text-sm font-medium text-[var(--cyan)] hover:bg-[var(--cyan)]/20 transition-colors border border-[var(--cyan)]/20"
                >
                  Commencer →
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4 max-w-3xl mx-auto">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-white/[0.06] p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-3 rounded-2xl border border-white/[0.06] bg-white/5 px-4 py-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pose ta question à AKASHA… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                style={{ minHeight: '44px', maxHeight: '200px' }}
                disabled={sending}
                data-testid="chat-input"
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Mic button — Web Speech API native */}
                <button
                  onClick={toggleVoice}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                    listening
                      ? 'bg-red-500/20 text-red-400 animate-pulse'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10'
                  )}
                  title={listening ? 'Arreter le micro' : 'Dictee vocale'}
                  data-testid="chat-mic"
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                    input.trim() && !sending
                      ? 'bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-black hover:opacity-90 shadow-lg shadow-[var(--cyan)]/20'
                      : 'bg-white/5 text-[var(--text-muted)] cursor-not-allowed'
                  )}
                  data-testid="chat-send"
                  title="Envoyer"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <AIDisclosure appName="AKASHA AI" className="mt-2 text-center text-[11px] text-[var(--text-muted)]" />

            {/* Quota bar */}
            {quota && !quota.isSuperAdmin && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>
                  {quota.remaining === 0
                    ? '⚠️ Quota journalier atteint'
                    : `${quota.remaining} requête${quota.remaining > 1 ? 's' : ''} restante${quota.remaining > 1 ? 's' : ''} aujourd'hui`}
                </span>
                {quota.remaining === 0 && (
                  <a
                    href="/pricing"
                    className="text-[var(--cyan)] hover:underline font-medium"
                  >
                    Passer à un plan supérieur →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
