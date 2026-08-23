'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, ChevronRight, HelpCircle, MessageSquare, CreditCard,
  Users, Wrench, Sparkles, ArrowLeft, Send, X, Bot, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import AIDisclosure from '@/lib/legal/components/AIDisclosure'
import type { FaqArticle } from '@/types'

const CATEGORIES: { id: string; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'general', label: 'General', icon: <HelpCircle className="h-5 w-5" />, color: '#00d4ff' },
  { id: 'chat', label: 'Chat IA', icon: <MessageSquare className="h-5 w-5" />, color: '#a855f7' },
  { id: 'creation', label: 'Creation', icon: <Sparkles className="h-5 w-5" />, color: '#f59e0b' },
  { id: 'agents', label: 'Agents', icon: <Wrench className="h-5 w-5" />, color: '#10b981' },
  { id: 'billing', label: 'Facturation', icon: <CreditCard className="h-5 w-5" />, color: '#ef4444' },
  { id: 'referral', label: 'Parrainage', icon: <Users className="h-5 w-5" />, color: '#ec4899' },
  { id: 'wallet', label: 'Wallet', icon: <CreditCard className="h-5 w-5" />, color: '#3b82f6' },
  { id: 'points', label: 'Points', icon: <Sparkles className="h-5 w-5" />, color: '#f97316' },
  { id: 'support', label: 'Support', icon: <HelpCircle className="h-5 w-5" />, color: '#6366f1' },
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function AidePage() {
  const [articles, setArticles] = useState<FaqArticle[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Chatbot state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('faq_articles').select('*').order('category')
      .then(({ data }) => {
        if (data) setArticles(data as FaqArticle[])
        setLoading(false)
      })
  }, [supabase])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const filtered = articles.filter(a => {
    const matchSearch = !search || a.question.toLowerCase().includes(search.toLowerCase()) || a.answer.toLowerCase().includes(search.toLowerCase())
    const matchCat = !activeCategory || a.category === activeCategory
    return matchSearch && matchCat
  })

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/aide/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error ?? 'Desole, une erreur est survenue. Reessaie !' }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connexion perdue. Verifie ta connexion internet et reessaie.' }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatMessages])

  return (
    <div className="min-h-screen bg-[var(--bg-void)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-nebula)]">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--cyan)]">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Centre d&apos;aide AKASHA</h1>
          <p className="mt-2 text-[var(--text-secondary)]">Trouve rapidement une reponse a ta question</p>

          {/* Search */}
          <div className="relative mx-auto mt-6 max-w-lg">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une question..."
              className="w-full rounded-2xl border border-[var(--border)] bg-white/5 py-3 pl-12 pr-4 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] placeholder:text-[var(--text-secondary)]"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Categories */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
              !activeCategory ? 'bg-[var(--cyan)]/10 text-[var(--cyan)]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
            )}
          >
            Tout
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                activeCategory === cat.id ? 'bg-[var(--cyan)]/10 text-[var(--cyan)]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Articles */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <HelpCircle className="mx-auto h-12 w-12 text-[var(--text-secondary)]" />
            <p className="mt-4 text-lg font-medium text-[var(--text-primary)]">Aucun resultat</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Essaie un autre mot-cle ou pose ta question au chatbot</p>
            <button
              onClick={() => setChatOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <MessageSquare className="h-4 w-4" /> Demander a l&apos;assistant
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(article => (
              <details key={article.id} className="group glass rounded-xl">
                <summary className="flex cursor-pointer items-center justify-between px-5 py-4">
                  <span className="font-medium text-[var(--text-primary)]">{article.question}</span>
                  <ChevronRight className="h-5 w-5 text-[var(--text-secondary)] transition-transform group-open:rotate-90" />
                </summary>
                <div className="border-t border-[var(--border)] px-5 py-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {article.answer}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <div className="mt-12 rounded-2xl bg-gradient-to-r from-[var(--cyan)]/10 to-[var(--purple)]/10 p-8 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Tu n&apos;as pas trouve ta reponse ?</h2>
          <p className="mt-2 text-[var(--text-secondary)]">Notre equipe est la pour t&apos;aider</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Bot className="h-4 w-4" /> Assistant IA
            </button>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-6 py-3 font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
            >
              <MessageSquare className="h-4 w-4" /> Nous contacter
            </Link>
          </div>
        </div>
      </div>

      {/* Floating Chatbot Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white shadow-lg shadow-[var(--cyan)]/20 hover:scale-105 transition-transform"
          aria-label="Ouvrir l'assistant"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Chat Panel */}
      {chatOpen && (
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
              onClick={() => setChatOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
              aria-label="Fermer le chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <AIDisclosure appName="AKASHA AI" className="border-b border-[var(--border)] px-4 py-1.5 text-center text-[10px] text-[var(--text-muted)]" />

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="mx-auto h-10 w-10 text-[var(--cyan)]" />
                <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">Salut ! Comment puis-je t&apos;aider ?</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Pose-moi n&apos;importe quelle question sur AKASHA</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['Comment fonctionne le parrainage ?', 'Quels sont les plans ?', 'Comment retirer mes gains ?'].map(q => (
                    <button
                      key={q}
                      onClick={() => { setChatInput(q); }}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
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

            {chatLoading && (
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
              onSubmit={e => { e.preventDefault(); sendChatMessage() }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Pose ta question..."
                className="flex-1 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] placeholder:text-[var(--text-secondary)]"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-30"
                aria-label="Envoyer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
