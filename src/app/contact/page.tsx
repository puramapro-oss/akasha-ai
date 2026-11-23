'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Send, ArrowLeft, Mail, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { COMPANY_INFO } from '@/lib/constants'
import { clearPendingRequest, getPendingRequestId, readPendingRequestId, withPendingRequestLock } from '@/lib/idempotency/browser-request'

type Feedback = { kind: 'stored'; id: string; team: boolean; confirmation: boolean }
  | { kind: 'unconfirmed' | 'error'; message: string }
const UNCERTAIN = 'La confirmation est indisponible. Ton message peut avoir été enregistré. Tu peux vérifier et terminer cet envoi sans créer de doublon.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const pending = useRef<AbortController | null>(null)
  const intention = useRef<{ key: string; id: string } | null>(null)
  const acknowledged = useRef(false)
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending.current || acknowledged.current) return
    if (!name || !email || !subject || !message) {
      toast.error('Remplis tous les champs')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    const submitted = { name, email, subject, message }
    setSending(true)
    setFeedback(null)
    const timer = setTimeout(() => controller.abort(), 45_000)
    let dispatched = false
    let recovering = feedback?.kind === 'unconfirmed'
    try {
      // Persist only a content fingerprint and an operation id, never the name,
      // email address or message. Identical retries recover the same id after
      // reload; the existing shared lock also covers concurrent browser tabs.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(submitted)))
      const key = 'akasha:contact:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (pending.current !== controller || controller.signal.aborted) return
      const tabKey = key + ':intention'
      const retained = intention.current?.key === key ? intention.current.id : sessionStorage.getItem(tabKey)
      if (retained !== null && !UUID.test(retained)) throw new Error('Invalid retained contact operation')
      const shared = readPendingRequestId(key)
      const knownId = retained ?? shared
      recovering = recovering || knownId !== null
      // Remember another tab's active request before asking for its lock: an
      // immediate lock refusal must not discard the identity already observed.
      if (knownId !== null) {
        sessionStorage.setItem(tabKey, knownId)
        if (sessionStorage.getItem(tabKey) !== knownId) throw new Error('Unconfirmed contact intention persistence')
        intention.current = { key, id: knownId }
      }
      await withPendingRequestLock(key, async () => {
        if (pending.current !== controller || controller.signal.aborted) return
        // Another tab may already have confirmed and removed the shared key.
        // Keep this tab's original intention across retries AND reloads so that
        // it cannot silently become a new operation after that confirmation.
        const lockedId = knownId ?? readPendingRequestId(key)
        recovering = recovering || lockedId !== null
        const requestId = lockedId ?? getPendingRequestId(key)
        sessionStorage.setItem(tabKey, requestId)
        if (sessionStorage.getItem(tabKey) !== requestId) throw new Error('Unconfirmed contact intention persistence')
        intention.current = { key, id: requestId }
        const clearIntention = () => {
          try {
            clearPendingRequest(key, requestId)
            if (sessionStorage.getItem(tabKey) === requestId) sessionStorage.removeItem(tabKey)
          } catch { /* A confirmed receipt stays confirmed if cleanup is unavailable. */ }
          intention.current = null
        }
        dispatched = true
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
          body: JSON.stringify(submitted),
          signal: controller.signal,
        })
        const data = await res.json()
        if (pending.current !== controller) return
        if (res.ok && data?.success === true && data.stored === true
          && typeof data.message_id === 'string' && UUID.test(data.message_id) && data.message_id.toLowerCase() === requestId.toLowerCase()) {
          acknowledged.current = true
          clearIntention()
          setFeedback({ kind: 'stored', id: data.message_id,
            team: data.emails?.team === 'accepted', confirmation: data.emails?.confirmation === 'accepted' })
          toast.success('Message enregistré.')
          setName(current => current === submitted.name ? '' : current)
          setEmail(current => current === submitted.email ? '' : current)
          setSubject(current => current === submitted.subject ? '' : current)
          setMessage(current => current === submitted.message ? '' : current)
          return
        }
        const rejected = !res.ok && data?.stored === false
        // A rejected retry says nothing about the preceding request's commit.
        // Keep both its identity and its uncertainty until a matching receipt.
        const reason = rejected && typeof data.error === 'string'
          ? data.error + (recovering ? ' ' + UNCERTAIN : '') : UNCERTAIN
        if (rejected && !recovering) clearIntention()
        setFeedback({ kind: rejected && !recovering ? 'error' : 'unconfirmed', message: reason })
        toast.error(reason)
      })
    } catch {
      if (pending.current !== controller) return
      const uncertain = dispatched || recovering
      const reason = uncertain ? UNCERTAIN : 'Cet envoi ne peut pas démarrer. Vérifie qu’aucun autre onglet ne l’envoie et que le stockage du navigateur est disponible, puis réessaie.'
      setFeedback({ kind: uncertain ? 'unconfirmed' : 'error', message: reason })
      toast.error(reason)
    } finally {
      clearTimeout(timer)
      if (pending.current === controller) { pending.current = null; setSending(false) }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--cyan)]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Contact</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Une question ? Un probleme ? Ecris-nous.</p>

        {feedback && <div role={feedback.kind === 'stored' ? 'status' : 'alert'}
          className="mt-6 rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-primary)]">
          {feedback.kind === 'stored' ? <>
            <p>Ton message est enregistré. Tu n’as pas besoin de le renvoyer.</p>
            <p className="mt-2 break-all">Référence : {feedback.id}</p>
            <ul className="mt-2 space-y-1">
              <li>Notification de l’équipe : {feedback.team ? 'prise en charge' : 'non confirmée'}.</li>
              <li>Email de confirmation : {feedback.confirmation ? 'pris en charge' : 'non confirmé'}.</li>
            </ul>
            <button type="button" className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2"
              onClick={() => { acknowledged.current = false; setFeedback(null) }}>Écrire un autre message</button>
          </> : <p>{feedback.message}</p>}
        </div>}

        {feedback?.kind !== 'stored' && <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="name">Nom</label>
              <input id="name"
                type="text"
                maxLength={100}
                disabled={sending || feedback?.kind === 'unconfirmed'}
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="email">Email</label>
              <input id="email"
                type="email"
                disabled={sending || feedback?.kind === 'unconfirmed'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="subject">Sujet</label>
            <input id="subject"
              type="text"
              maxLength={200}
              disabled={sending || feedback?.kind === 'unconfirmed'}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="message">Message</label>
            <textarea id="message"
              maxLength={5000}
              disabled={sending || feedback?.kind === 'unconfirmed'}
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              rows={5}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {sending ? 'Envoi...' : <><Send className="h-4 w-4" /> {feedback?.kind === 'unconfirmed' ? 'Vérifier et terminer cet envoi' : 'Envoyer'}</>}
          </button>
        </form>}

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <div className="glass rounded-xl p-5">
            <Mail className="h-6 w-6 text-[var(--cyan)]" />
            <p className="mt-2 font-medium text-[var(--text-primary)]">Email</p>
            <p className="text-sm text-[var(--text-secondary)]">contact@purama.dev</p>
          </div>
          <div className="glass rounded-xl p-5">
            <MapPin className="h-6 w-6 text-[var(--cyan)]" />
            <p className="mt-2 font-medium text-[var(--text-primary)]">Adresse</p>
            <p className="text-sm text-[var(--text-secondary)]">{COMPANY_INFO.address}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
