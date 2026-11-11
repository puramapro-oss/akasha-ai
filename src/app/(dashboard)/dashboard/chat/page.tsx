'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, Plus, Search, MessageSquare, Mic, MicOff, Loader2, Bot } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useConversations } from '@/hooks/useConversations'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useQuota } from '@/hooks/useQuota'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { cn } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import AIDisclosure from '@/lib/legal/components/AIDisclosure'
import { ModelSelector, MessageBubble, ConvItem } from '@/components/chat/ChatUtils'
import { canUseAkashaModel, DEFAULT_AKASHA_MODEL, isAkashaModelId, type AkashaModelId } from '@/lib/constants'

function ChatContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { user, plan, loading: authLoading, error: authError, refetch: retryAuth } = auth
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedModel = searchParams.get('model')
  const selectedModel = requestedModel === null ? DEFAULT_AKASHA_MODEL
    : isAkashaModelId(requestedModel) ? requestedModel : null
  const modelError = selectedModel === null ? 'Modèle inconnu. Choisis un modèle dans la liste.'
    : !canUseAkashaModel(selectedModel, plan) ? 'Ce modèle est indisponible avec ton accès actuel. Choisis un autre modèle.' : null

  function selectModel(model: AkashaModelId) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('model', model)
    router.replace(`/dashboard/chat?${params.toString()}`, { scroll: false })
  }

  // Conversations
  const { conversations, loading: convsLoading, fetchConversations } = useConversations(user?.id)
  const [searchQuery, setSearchQuery] = useState('')

  // Messages
  const { messages, loading: msgsLoading, sending, error: chatError, activeConvId, loadConversation, sendMessage, clearMessages } = useChatMessages()

  // Input
  const [input, setInput] = useState('')

  // Quota
  const { quota, fetchQuota } = useQuota()

  // Voice
  const handleVoiceTranscript = (text: string) => {
    setInput((prev) => (prev ? prev + ' ' + text : text).trim())
  }
  const { listening, toggleVoice } = useVoiceInput(handleVoiceTranscript)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    clearMessages()
    setInput('')
    textareaRef.current?.focus()
  }

  // ── Send message ──────────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text || !user || sending || msgsLoading || authLoading || authError || modelError || !selectedModel) return
    setInput('')
    await sendMessage(text, selectedModel, fetchConversations, fetchQuota)
  }

  // ── Key handler ───────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Filtered conversations ────────────────────────────────────────────────────
  const filteredConvs = conversations.filter(
    (c) => !searchQuery || (c.title ?? '').toLowerCase().includes(searchQuery.toLowerCase())
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
            <input aria-label="Rechercher..."
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
              {filteredConvs.map((conv) => (
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
              aria-label="Nouvelle conversation"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors lg:hidden"
              data-testid="mobile-new-conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            <ModelSelector selected={selectedModel} onSelect={selectModel} plan={authLoading ? null : plan} disabled={sending || authLoading} />
          </div>

          {/* Quota indicator */}
          {quota && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              {quota.isSuperAdmin ? (
                <span className="text-[var(--cyan)]">∞ illimité</span>
              ) : (
                <>
                  <span
                    className={cn(
                      'font-medium',
                      quota.remaining === 0
                        ? 'text-red-400'
                        : quota.remaining < 5
                          ? 'text-yellow-400'
                          : 'text-[var(--text-muted)]'
                    )}
                  >
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
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-white/[0.06] p-4">
          <div className="mx-auto max-w-3xl">
            {!authLoading && modelError && <p role="alert" className="mb-2 text-sm text-amber-300">{modelError}</p>}
            {chatError && <p role="alert" className="mb-2 text-sm text-amber-300">{chatError}</p>}
            {authError && <div role="alert" className="mb-2 text-sm text-amber-300">
              <p>{authError}</p>
              <button type="button" onClick={() => { void retryAuth() }} disabled={authLoading} className="mt-1 underline disabled:opacity-50">
                Réessayer la connexion
              </button>
            </div>}
            <div className="flex items-end gap-3 rounded-2xl border border-white/[0.06] bg-white/5 px-4 py-3">
              <textarea aria-label="Pose ta question à AKASHA… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
                  disabled={!input.trim() || !user || sending || msgsLoading || authLoading || Boolean(authError) || Boolean(modelError)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                    input.trim() && user && !sending && !msgsLoading && !authLoading && !authError && !modelError
                      ? 'bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-black hover:opacity-90 shadow-lg shadow-[var(--cyan)]/20'
                      : 'bg-white/5 text-[var(--text-muted)] cursor-not-allowed'
                  )}
                  data-testid="chat-send"
                  title="Envoyer"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
                  <a href="/pricing" className="text-[var(--cyan)] hover:underline font-medium">
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

export default function ChatPage() {
  const auth = useAuth()
  return <Suspense fallback={<p role="status">Chargement du chat…</p>}><ChatContent key={auth.user?.id ?? 'signed-out'} auth={auth} /></Suspense>
}
