import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import type { ChatMessage } from '@/types/chat'
import type { Message } from '@/types'

export function useChatMessages() {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  const loadConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId)
      setLoading(true)
      setMessages([])
      try {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
        const msgs = ((data as Message[]) ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
        setMessages(msgs)
      } catch {
        toast.error('Impossible de charger la conversation')
      } finally {
        setLoading(false)
      }
    },
    [supabase]
  )

  const sendMessage = useCallback(
    async (
      text: string,
      selectedModel: string,
      onConversationUpdate: () => Promise<void>,
      onQuotaUpdate: () => Promise<void>
    ) => {
      if (!text.trim() || sending) return

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

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setSending(true)

      // Build messages history for API
      const history: { role: 'user' | 'assistant'; content: string }[] = [
        ...messages.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
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
          const errData = (await res.json()) as { error?: string }
          if (res.status === 429) {
            toast.error('Quota journalier atteint. Passe à un plan supérieur pour continuer.')
          } else {
            toast.error(errData.error ?? "Erreur lors de l'envoi")
          }
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
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
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: fullText } : m))
                )
              }
            } catch {
              // skip malformed
            }
          }
        }

        // Mark streaming done
        setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m)))

        // Refresh conversations
        await onConversationUpdate()
        await onQuotaUpdate()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast.error(msg)
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id))
      } finally {
        setSending(false)
      }
    },
    [sending, messages, activeConvId, supabase]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setActiveConvId(null)
  }, [])

  return {
    messages,
    loading,
    sending,
    activeConvId,
    loadConversation,
    sendMessage,
    clearMessages,
  }
}
