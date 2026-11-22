'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Send, ArrowLeft, Mail, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { COMPANY_INFO } from '@/lib/constants'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState<{ partial: boolean } | null>(null)
  const submissionLocked = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submissionLocked.current) return
    if (!name || !email || !subject || !message) {
      toast.error('Remplis tous les champs')
      return
    }
    submissionLocked.current = true
    setSending(true)
    let received = false
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      const payload: unknown = await res.json()
      const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
      const partial = data?.received === true && data?.status === 'partial'
      if (!partial && (!res.ok || data?.success !== true)) {
        toast.error(typeof data?.error === 'string' ? data.error : "La réception du message n'a pas pu être confirmée.")
        return
      }
      received = true
      setReceipt({ partial })
      if (partial) toast.info('Message enregistré ; notifications email non confirmées.')
      else toast.success('Message reçu et enregistré.')
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    } catch {
      toast.error('Erreur de connexion. Verifie ta connexion internet.')
    } finally {
      if (!received) submissionLocked.current = false
      setSending(false)
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

        {receipt ? (
          <div role="status" className="mt-8 space-y-4 rounded-xl border border-[var(--border)] bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Ton message est enregistré.</h2>
            <p className="text-[var(--text-secondary)]">
              {receipt.partial
                ? "Les notifications par email n'ont pas pu être confirmées. Ton message est bien conservé ; inutile de renvoyer le formulaire."
                : "Merci pour ton message. Notre équipe pourra te répondre à l'adresse email indiquée."}
            </p>
            <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-primary)]"
              onClick={() => { submissionLocked.current = false; setReceipt(null) }}>
              Écrire un autre message
            </button>
          </div>
        ) : <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="name">Nom</label>
              <input id="name"
                type="text"
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
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]" htmlFor="message">Message</label>
            <textarea id="message"
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
            {sending ? 'Envoi...' : <><Send className="h-4 w-4" /> Envoyer</>}
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
