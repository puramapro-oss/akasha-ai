import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { ChatStreamError, readChatStream, awaitChatOperation } from '@/lib/chat-stream'
import type { ChatMessage } from '@/types/chat'
import type { Message } from '@/types'

export const CHAT_CLIENT_TIMEOUT_MS = 120_000
export const CHAT_HISTORY_TIMEOUT_MS = 15_000
interface ChatState {
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  activeConvId: string | null
  error: string | null
}
interface Operation { controller: AbortController; revision: number }
function emptyState(): ChatState {
  return { messages: [], loading: false, sending: false, activeConvId: null, error: null }
}

export function useChatMessages() {
  const [supabase] = useState(createClient)
  const [state, setState] = useState<ChatState>(emptyState)
  const stateRef = useRef(state)
  const active = useRef<Operation | null>(null)
  const revision = useRef(0)
  const mounted = useRef(false)

  const update = useCallback((patch: Partial<ChatState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    if (mounted.current) setState(stateRef.current)
  }, [])
  const invalidate = useCallback(() => {
    const previous = active.current
    active.current = null
    revision.current += 1
    previous?.controller.abort()
  }, [])
  const owns = useCallback((operation: Operation) => mounted.current && active.current === operation, [])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; invalidate() }
  }, [invalidate])

  const clearMessages = useCallback(() => {
    invalidate()
    update(emptyState())
  }, [invalidate, update])

  const loadConversation = useCallback(async (convId: string) => {
    if (!mounted.current) return
    invalidate()
    const operation = { controller: new AbortController(), revision: revision.current }
    active.current = operation
    update({ ...emptyState(), activeConvId: convId, loading: true })
    const timer = setTimeout(() => operation.controller.abort('timeout'), CHAT_HISTORY_TIMEOUT_MS)
    try {
      const { data, error } = await awaitChatOperation(supabase.from('messages').select('*')
        .eq('conversation_id', convId).order('created_at', { ascending: true })
        .abortSignal(operation.controller.signal), operation.controller.signal)
      if (!owns(operation)) return
      if (error) throw new Error('History unavailable')
      update({ messages: ((data as Message[]) ?? []).map(m => ({ id: m.id, role: m.role, content: m.content })) })
    } catch {
      if (owns(operation)) {
        const error = operation.controller.signal.reason === 'timeout'
          ? 'Le délai de chargement est dépassé. Réessaie dans quelques instants.'
          : 'Impossible de charger la conversation. Réessaie dans quelques instants.'
        update({ error }); toast.error(error)
      }
    } finally {
      clearTimeout(timer)
      if (owns(operation)) { active.current = null; update({ loading: false }) }
    }
  }, [supabase, invalidate, owns, update])

  const sendMessage = useCallback(async (
    text: string,
    selectedModel: string,
    onConversationUpdate: () => Promise<void>,
    onQuotaUpdate: () => Promise<void>,
  ) => {
    // This synchronous lock also covers clicks occurring before React re-renders.
    if (!text.trim() || active.current || !mounted.current) return
    const operation = { controller: new AbortController(), revision: ++revision.current }
    active.current = operation
    const previous = stateRef.current
    const userMsg: ChatMessage = { id: `tmp-user-${operation.revision}`, role: 'user', content: text }
    const assistantMsg: ChatMessage = { id: `tmp-assistant-${operation.revision}`, role: 'assistant', content: '', streaming: true }
    const history = [...previous.messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content })), { role: 'user' as const, content: text }]
    update({ messages: [...previous.messages, userMsg, assistantMsg], sending: true, error: null })
    let fullText = '', succeeded = false
    const timer = setTimeout(() => operation.controller.abort('timeout'), CHAT_CLIENT_TIMEOUT_MS)
    try {
      const response = fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: operation.controller.signal,
        body: JSON.stringify({ messages: history, conversationId: previous.activeConvId ?? undefined, model: selectedModel }),
      })
      void response.then(late => {
        if (operation.controller.signal.aborted || !owns(operation)) void late.body?.cancel().catch(() => undefined)
      }, () => undefined)
      const res = await awaitChatOperation(response, operation.controller.signal)
      if (!owns(operation)) { void res.body?.cancel().catch(() => undefined); return }
      if (!res.ok) {
        let message = "Impossible d'obtenir une réponse. Réessaie dans quelques instants."
        try {
          const payload: unknown = await awaitChatOperation(res.json(), operation.controller.signal)
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') message = payload.error.slice(0, 500)
        } catch { /* A proxy HTML response is not a provider error to expose. */ }
        throw new ChatStreamError(message)
      }
      if (!res.body) throw new ChatStreamError('Pas de réponse du serveur. Réessaie dans quelques instants.')
      if (!(res.headers.get('content-type') ?? '').toLowerCase().startsWith('text/event-stream')) {
        void res.body.cancel().catch(() => undefined)
        throw new ChatStreamError('Le serveur a renvoyé un format de réponse inattendu.')
      }
      await readChatStream(res.body, operation.controller.signal, event => {
        if (!owns(operation) || operation.controller.signal.aborted) return
        if (event.conversationId) update({ activeConvId: event.conversationId })
        if (event.text) {
          fullText += event.text
          update({ messages: stateRef.current.messages.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m) })
        }
      })
      if (!fullText) throw new ChatStreamError("L'IA n'a renvoyé aucun texte. Réessaie dans quelques instants.")
      succeeded = true
    } catch (cause) {
      if (owns(operation)) {
        const error = operation.controller.signal.reason === 'timeout'
          ? 'Le délai de réponse est dépassé. Le texte déjà reçu est conservé.'
          : cause instanceof ChatStreamError ? cause.message
            : 'La connexion a été interrompue. Le texte déjà reçu est conservé.'
        update({ error }); toast.error(error)
      }
    } finally {
      clearTimeout(timer)
      if (owns(operation)) {
        update({ sending: false, messages: stateRef.current.messages
          .filter(m => m.id !== assistantMsg.id || fullText.length > 0)
          .map(m => m.id === assistantMsg.id ? { ...m, streaming: false } : m) })
        active.current = null
      }
    }
    if (succeeded && mounted.current && revision.current === operation.revision) {
      // A refresh failure must never delete the already received answer.
      const results = await Promise.allSettled([
        Promise.resolve().then(onConversationUpdate), Promise.resolve().then(onQuotaUpdate),
      ])
      if (mounted.current && revision.current === operation.revision && results.some(r => r.status === 'rejected')) {
        toast.error("Réponse conservée, mais l'historique ou le quota n'a pas pu être actualisé.")
      }
    }
  }, [owns, update])

  return { ...state, loadConversation, sendMessage, clearMessages }
}
