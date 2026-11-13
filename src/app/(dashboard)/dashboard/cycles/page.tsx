'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useChatMessages } from '@/hooks/useChatMessages'
import {
  buildSymbolicIAOContext,
  calculateSymbolicCycles,
  SYMBOLIC_CYCLE_SOURCES,
  type SymbolicCycleSnapshot,
  ZODIAC_SIGNS,
} from '@/lib/symbolic-cycles'

function todayLocal(): string {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export default function SymbolicCyclesPage() {
  const [birthDate, setBirthDate] = useState('')
  const [asOfDate, setAsOfDate] = useState('')
  const [ascendantSign, setAscendantSign] = useState('')
  const [allowIAO, setAllowIAO] = useState(false)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<SymbolicCycleSnapshot | null>(null)
  const [error, setError] = useState('')
  const { messages, sending, sendMessage, clearMessages } = useChatMessages()

  function input() {
    return {
      birthDate,
      asOfDate: asOfDate || todayLocal(),
      ...(ascendantSign !== '' ? { ascendantSign: Number(ascendantSign) } : {}),
    }
  }

  function calculate() {
    try {
      const snapshot = calculateSymbolicCycles(input())
      setResult(snapshot)
      setError('')
      return snapshot
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : 'Calcul impossible')
      return null
    }
  }

  async function askIAO() {
    if (!allowIAO) {
      setError("Active explicitement le partage avec IAO pour cette session.")
      return
    }
    const snapshot = calculate()
    if (!snapshot) return
    const context = buildSymbolicIAOContext({ ...input(), consent: true })
    const freeQuestion = question.trim().slice(0, 1500)
    const prompt = [
      context,
      'Réponds en distinguant clairement les sources historiques des interprétations symboliques.',
      'Ne conclus rien sur mes croyances personnelles. Privilégie les exercices et questions de réflexion libre.',
      freeQuestion ? `Ma question : ${freeQuestion}` : 'Explique les deux cycles, leur différence et propose un exercice de réflexion facultatif.',
    ].join('\n\n')
    await sendMessage(prompt, 'akasha-sonnet', async () => {}, async () => {})
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-white">
      <header className="space-y-2">
        <Link href="/dashboard/chat" className="text-sm text-cyan-300 hover:underline">Retour à AKASHA</Link>
        <h1 className="text-3xl font-semibold">Cycles symboliques et IAO</h1>
        <p className="text-sm text-white/70">
          Étudier les profections hellénistiques et l’Horloge cosmique de la tradition Summit Lighthouse,
          sans les confondre avec la numérologie ni en faire des prédictions.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Date de naissance
            <input aria-label="Date de naissance" type="date" value={birthDate}
              onChange={(event) => { setBirthDate(event.target.value); setResult(null) }}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white" />
          </label>
          <label className="block text-sm">
            Date de référence (vide = aujourd’hui)
            <input aria-label="Date de référence" type="date" value={asOfDate}
              onChange={(event) => { setAsOfDate(event.target.value); setResult(null) }}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white" />
          </label>
        </div>
        <label className="block text-sm">
          Ascendant natal — seulement si tu le connais avec une heure et un lieu de naissance fiables
          <select aria-label="Signe ascendant" value={ascendantSign}
            onChange={(event) => { setAscendantSign(event.target.value); setResult(null) }}
            className="mt-1 w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white">
            <option value="">Inconnu : ne pas inventer le maître de l’année</option>
            {ZODIAC_SIGNS.map((sign, index) => <option key={sign.name} value={index}>{sign.name}</option>)}
          </select>
        </label>

        <button type="button" onClick={calculate} disabled={!birthDate}
          className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-black disabled:opacity-40">
          Calculer localement
        </button>
        <p className="text-xs text-white/60">
          Le calcul local ne transmet pas ta date de naissance à IAO. Aucune croyance n’est déduite ou enregistrée.
        </p>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </section>

      {result && (
        <section aria-live="polite" className="space-y-3 rounded-2xl border border-white/15 p-5">
          <h2 className="text-lg font-semibold">Lecture des cycles à {result.age} ans</h2>
          <p>Profection annuelle : <strong>maison {result.annualProfection.house}</strong>
            {result.annualProfection.sign
              ? `, ${result.annualProfection.sign}, maître traditionnel ${result.annualProfection.traditionalRuler}`
              : ' — Ascendant absent, signe et maître non déterminables'}.
          </p>
          <p>Horloge cosmique : <strong>{result.cosmicClock.label} · {result.cosmicClock.sign}</strong>, tour {result.cosmicClock.revolution}.</p>
          <p className="text-sm text-white/60">{result.note}</p>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-white/15 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Interprétation facultative par IAO</h2>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={allowIAO} onChange={(event) => {
            setAllowIAO(event.target.checked)
            if (!event.target.checked) { setQuestion(''); clearMessages() }
          }} className="mt-1 h-4 w-4" />
          <span>J’accepte de transmettre à IAO, pour cette demande, <strong>uniquement les résultats symboliques dérivés</strong>
            (âge, maisons et correspondances), afin de recevoir une explication pédagogique.
            La question et la réponse peuvent figurer dans l’historique habituel du chat.
            Je peux désactiver ce partage à tout moment.</span>
        </label>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1500}
          aria-label="Question facultative à IAO" rows={3}
          placeholder="Que représente cette maison dans la tradition ? Propose-moi un exercice libre."
          className="w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white" />
        <button type="button" disabled={!allowIAO || !birthDate || sending} onClick={askIAO}
          className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 px-5 py-3 font-semibold text-black disabled:opacity-40">
          {sending ? 'IAO répond…' : 'Explorer avec IAO'}
        </button>
        {messages.length > 0 && (
          <div className="space-y-3 border-t border-white/10 pt-4" aria-live="polite">
            {messages.filter((message) => message.role === 'assistant').map((message) => (
              <div key={message.id} className="whitespace-pre-wrap rounded-xl bg-white/10 p-4 text-sm">
                {message.content || (message.streaming ? 'IAO prépare sa réponse…' : '')}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="space-y-2 text-xs text-white/60">
        <p>Sources des méthodes, non preuves de leurs interprétations :</p>
        <p><a className="underline" href={SYMBOLIC_CYCLE_SOURCES.profections} target="_blank" rel="noopener noreferrer">Profections annuelles — étude historique</a></p>
        <p><a className="underline" href={SYMBOLIC_CYCLE_SOURCES.cosmicClock} target="_blank" rel="noopener noreferrer">Horloge cosmique — source de la tradition</a></p>
      </footer>
    </main>
  )
}
