'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SpiritualSessionComposer } from '@/components/SpiritualSessionComposer'
import { copyToClipboard } from '@/lib/utils'
import { getCyclesSharePayload, shareLocaleFromBrowser } from '@/lib/symbolic-share'
import {
  calculateSymbolicCycles,
  getSymbolicCycleTimeline,
  localCalendarDate,
  SYMBOLIC_CYCLE_SOURCES,
  type SymbolicTimelineEntry,
  type SymbolicCycleSnapshot,
  ZODIAC_SIGNS,
} from '@/lib/symbolic-cycles'

export default function SymbolicCyclesPage() {
  const [birthDate, setBirthDate] = useState('')
  const [asOfDate, setAsOfDate] = useState('')
  const [ascendantSign, setAscendantSign] = useState('')
  const [result, setResult] = useState<SymbolicCycleSnapshot | null>(null)
  const [timeline, setTimeline] = useState<SymbolicTimelineEntry[]>([])
  const [error, setError] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  function resetComputation() {
    setResult(null)
    setTimeline([])
    setError('')
    setShareStatus('')
  }

  async function sharePublicPage() {
    const payload = getCyclesSharePayload(shareLocaleFromBrowser(navigator.language))
    const copy = async () => {
      const ok = await copyToClipboard(`${payload.text}\n${payload.url}`)
      setShareStatus(ok ? 'Texte et lien copiés : choisis librement où les partager.' : 'Copie impossible dans ce navigateur.')
    }

    if (!navigator.share) {
      await copy()
      return
    }
    try {
      await navigator.share(payload)
      setShareStatus('Fenêtre de partage terminée ; aucune publication n’est présumée.')
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      await copy()
    }
  }

  function input() {
    return {
      birthDate,
      asOfDate: asOfDate || localCalendarDate(),
      ...(ascendantSign !== '' ? { ascendantSign: Number(ascendantSign) } : {}),
    }
  }

  function calculate() {
    try {
      const selectedInput = input()
      const snapshot = calculateSymbolicCycles(selectedInput)
      setResult(snapshot)
      setTimeline(getSymbolicCycleTimeline(selectedInput))
      setError('')
      return snapshot
    } catch (reason) {
      setResult(null)
      setTimeline([])
      setError(reason instanceof Error ? reason.message : 'Calcul impossible')
      return null
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-white">
      <header className="space-y-2">
        <div className="flex flex-wrap justify-between gap-3">
          <Link href="/dashboard/chat" className="text-sm text-cyan-300 hover:underline">Retour à AKASHA</Link>
          <Link href="/cycles" className="text-sm text-cyan-300 hover:underline">Présentation publique</Link>
        </div>
        <h1 className="text-3xl font-semibold">Cycles symboliques et IAO</h1>
        <p className="text-sm text-white/70">
          Compose une pratique selon ton intention. Tu peux y joindre tes cycles astrologiques et le nombre de naissance de JYOTI.
        </p>
      </header>

      <SpiritualSessionComposer birthDate={birthDate} asOfDate={asOfDate} ascendantSign={ascendantSign} />

      <section id="dates-cycles" aria-labelledby="dates-cycles-title" className="scroll-mt-6 space-y-4 rounded-2xl border border-white/15 bg-white/5 p-5">
        <h2 id="dates-cycles-title" className="text-lg font-semibold">Mes repères de naissance</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Date de naissance
            <input aria-label="Date de naissance" type="date" value={birthDate}
              onChange={(event) => { setBirthDate(event.target.value); resetComputation() }}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white" />
          </label>
          <label className="block text-sm">
            Date de référence (vide = aujourd’hui)
            <input aria-label="Date de référence" type="date" value={asOfDate}
              onChange={(event) => { setAsOfDate(event.target.value); resetComputation() }}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#14141e] p-3 text-white" />
          </label>
        </div>
        <label className="block text-sm">
          Ascendant natal — seulement si tu le connais avec une heure et un lieu de naissance fiables
          <select aria-label="Signe ascendant" value={ascendantSign}
            onChange={(event) => { setAscendantSign(event.target.value); resetComputation() }}
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
        <a href="#session-title" className="inline-block text-sm text-cyan-200 underline">Revenir à ma séance</a>
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
          {result.annualProfection.sign && (
            <p className="text-xs text-white/55">
              L’Ascendant est celui que tu as indiqué ; ce module ne recalcule pas le thème natal.
            </p>
          )}
        </section>
      )}

      {timeline.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-white/15 p-5" aria-labelledby="cycles-timeline-title">
          <div>
            <h2 id="cycles-timeline-title" className="text-lg font-semibold">Explorer les 12 prochaines années symboliques</h2>
            <p className="mt-1 text-sm text-white/60">
              Ce calendrier indique uniquement les positions calculées selon les deux traditions. Il ne prévoit aucun événement.
            </p>
          </div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {timeline.map((year, index) => (
              <li key={year.age}
                aria-current={index === 0 ? 'step' : undefined}
                className={`rounded-xl border p-3 ${index === 0 ? 'border-cyan-300/50 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <p className="text-sm font-semibold">{year.age} ans {index === 0 ? '· Maintenant' : ''}</p>
                <p className="mt-1 text-xs text-white/75">
                  Profection : maison {year.annualProfection.house}
                  {year.annualProfection.sign ? ` · ${year.annualProfection.sign}` : ''}
                </p>
                <p className="mt-1 text-xs text-white/75">
                  Horloge : {year.cosmicClock.label} · {year.cosmicClock.sign}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-5" aria-labelledby="cycles-share-title">
        <h2 id="cycles-share-title" className="text-lg font-semibold">Partager la découverte — pas tes données</h2>
        <p className="text-sm text-white/70">
          Le partage contient seulement une présentation générale des traditions et un lien public.
          Il ne révèle ni ta naissance, ni ton âge, ni ton Ascendant, ni tes résultats.
          Aucune publication automatique et aucune récompense fictive.
        </p>
        <button type="button" onClick={sharePublicPage}
          className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-5 py-3 font-semibold text-cyan-200 hover:bg-cyan-300/20">
          Partager cette découverte
        </button>
        {shareStatus && <p role="status" aria-live="polite" className="text-sm text-cyan-200">{shareStatus}</p>}
      </section>

      <footer className="space-y-2 text-xs text-white/60">
        <p>Sources des méthodes, non preuves de leurs interprétations :</p>
        <p><a className="underline" href={SYMBOLIC_CYCLE_SOURCES.profections} target="_blank" rel="noopener noreferrer">Profections annuelles — étude historique</a></p>
        <p><a className="underline" href={SYMBOLIC_CYCLE_SOURCES.cosmicClock} target="_blank" rel="noopener noreferrer">Horloge cosmique — source de la tradition</a></p>
      </footer>
    </main>
  )
}
