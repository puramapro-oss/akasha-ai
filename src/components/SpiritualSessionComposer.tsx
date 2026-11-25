import { useState } from 'react'
import type { NatalReflectionOption } from '@/lib/natal-reflection'
import { SpiritualSessionChat } from '@/components/SpiritualSessionChat'
import { localCalendarDate } from '@/lib/symbolic-cycles'
import { composeSpiritualSession, SESSION_FOCUS, SESSION_OUTCOMES, SESSION_TECHNIQUES, type SessionTechnique, type SpiritualSessionInput } from '@/lib/spiritual-session'
import { requestsNatalChart, suggestSessionPreferences } from '@/lib/session-request'
import { RishiNumerologyInput } from '@/components/RishiNumerologyInput'
import { describeRishiNumerologyReading, type RishiNumerologyReading } from '@/lib/rishi-numerology-reading'

type Session = ReturnType<typeof composeSpiritualSession>
type Preferences = Pick<SpiritualSessionInput, 'mode' | 'focus' | 'minutes' | 'guidance' | 'useAstrology' | 'useNumerology'> & { techniques: SessionTechnique[] }
interface ComposerProps {
  birthDate: string
  profileRevision: number
  asOfDate: string
  ascendantSign: string
  natalSummary?: string
  natalOptions?: NatalReflectionOption[]
  natalRevision?: number
}

const initial: Preferences = {
  mode: 'practical', focus: 'attention', minutes: 5, guidance: 'guided',
  useAstrology: false, useNumerology: false, techniques: [],
}

const modeNames = { practical: 'Pratique', mixed: 'Mixte', spiritual: 'Spirituel' }
const guidanceNames = { guided: 'Pas à pas', quiet: 'En silence' }
const fieldClass = 'mt-1 w-full rounded-lg border border-white/25 bg-[#14141e] p-3 text-white focus-visible:outline-cyan-300'
const actionClass = 'rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-45'

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (!minutes) return `${remainder} s`
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`
}

export function SpiritualSessionComposer({ birthDate, profileRevision, asOfDate, ascendantSign, natalSummary, natalOptions, natalRevision }: ComposerProps) {
  const [question, setQuestion] = useState('')
  const [preferences, setPreferences] = useState<Preferences>(initial)
  const [beforeSuggestion, setBeforeSuggestion] = useState<Preferences | null>(null)
  const [notice, setNotice] = useState('')

  const wantsNatalChart = requestsNatalChart(question)

  function change(patch: Partial<Preferences>) {
    setPreferences({ ...preferences, ...patch })
    setBeforeSuggestion(null)
    setNotice('')
  }

  function applyRequest() {
    const patch = suggestSessionPreferences(question, preferences.techniques)
    const changedKeys = Object.keys(patch) as (keyof Preferences)[]
    if (!changedKeys.length) {
      setNotice(wantsNatalChart ? 'Tu peux ouvrir ton thème natal depuis le lien ci-dessous.'
        : 'Aucun réglage reconnu dans cette phrase. Tu peux choisir les options ci-dessous.')
      return
    }
    const next = { ...preferences, ...patch }
    const unchanged = changedKeys.every(key => {
      if (key !== 'techniques') return next[key] === preferences[key]
      return next.techniques.length === preferences.techniques.length &&
        next.techniques.every((technique, index) => technique === preferences.techniques[index])
    })
    if (unchanged) {
      setNotice('Les choix reconnus dans ta demande sont déjà sélectionnés.')
      return
    }
    setBeforeSuggestion(preferences)
    setPreferences(next)
    setNotice('Les réglages reconnus sont appliqués. Tu peux les modifier avant de composer ta séance.')
  }

  const availableTechniques = (Object.keys(SESSION_TECHNIQUES) as SessionTechnique[]).filter(technique =>
    preferences.mode !== 'practical' || (technique !== 'mantra' && technique !== 'prayer'))
  const input: SpiritualSessionInput = {
    ...preferences,
    techniques: preferences.techniques.filter(technique => availableTechniques.includes(technique)),
    birthDate,
    asOfDate,
    ...(ascendantSign === '' ? {} : { ascendantSign: Number(ascendantSign) }),
  }

  return (
    <section aria-labelledby="session-title" className="space-y-5 rounded-2xl border border-cyan-200/25 bg-gradient-to-b from-cyan-200/[0.06] to-transparent p-5 sm:p-6">
      <h2 id="session-title" className="text-2xl font-semibold">Ma séance avec IAO</h2>
      <label className="block text-sm">
        Ma demande
        <textarea className={fieldClass} rows={2} maxLength={1500} value={question}
          placeholder="Je veux écrire pendant trois minutes en silence."
          onChange={event => {
            setQuestion(event.target.value)
            setBeforeSuggestion(null)
            setNotice('')
          }} />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button type="button" disabled={!question.trim()} onClick={applyRequest}
          className="rounded-lg border border-cyan-200/35 px-3 py-2 text-cyan-100 disabled:opacity-45">
          Reprendre les choix de ma demande
        </button>
        {beforeSuggestion && (
          <button type="button" className="text-cyan-200 underline" onClick={() => {
            setPreferences(beforeSuggestion)
            setBeforeSuggestion(null)
            setNotice('Tes réglages précédents sont rétablis.')
          }}>Annuler les réglages suggérés</button>
        )}
      </div>
      {notice && <p role="status" className="text-sm text-cyan-100">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Intention
          <select className={fieldClass} value={preferences.focus}
            onChange={event => change({ focus: event.target.value as Preferences['focus'] })}>
            {Object.entries(SESSION_FOCUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm">Mode de séance
          <select className={fieldClass} value={preferences.mode}
            onChange={event => change({ mode: event.target.value as Preferences['mode'] })}>
            {Object.entries(modeNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm">Durée en minutes
          <select className={fieldClass} value={preferences.minutes}
            onChange={event => change({ minutes: Number(event.target.value) })}>
            {Array.from({ length: 30 }, (_, index) => index + 1).map(minutes =>
              <option key={minutes} value={minutes}>{minutes} min</option>)}
          </select>
        </label>
        <label className="block text-sm">Accompagnement
          <select className={fieldClass} value={preferences.guidance}
            onChange={event => change({ guidance: event.target.value as Preferences['guidance'] })}>
            {Object.entries(guidanceNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      {preferences.mode !== 'practical' && (
        <fieldset className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-white/15 p-4 text-sm">
          <legend className="px-1 text-white/85">Lectures symboliques facultatives</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.useAstrology}
            onChange={event => change({ useAstrology: event.target.checked })} />Astrologie des cycles</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.useNumerology}
            onChange={event => change({ useNumerology: event.target.checked })} />Numérologie JYOTI</label>
        </fieldset>
      )}
      {(preferences.mode !== 'practical' || wantsNatalChart) && (
        <a href="#theme-natal" className="inline-block text-sm text-cyan-200 underline">
          Explorer mon thème natal · Soleil, Lune et ascendant
        </a>
      )}
      <details className="rounded-xl border border-white/15 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-white">Choisir mes pratiques</summary>
        <p className="mt-3 text-white/70">Les pratiques choisies se partagent le temps disponible.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {availableTechniques.map(technique => (
            <label key={technique} className="flex items-center gap-2">
              <input type="checkbox" checked={preferences.techniques.includes(technique)}
                onChange={event => change({ techniques: event.target.checked
                  ? [...preferences.techniques, technique]
                  : preferences.techniques.filter(choice => choice !== technique) })} />
              {SESSION_TECHNIQUES[technique]}
            </label>
          ))}
        </div>
      </details>
      <SessionPersonalization key={profileRevision} selection={input} question={question.trim()} natalRevision={natalRevision}
        natalSummary={preferences.mode !== 'practical' ? natalSummary : undefined}
        natalOptions={preferences.mode !== 'practical' ? natalOptions : undefined} />
    </section>
  )
}

type ReadingProps = {
  selection: SpiritualSessionInput
  question: string
  natalSummary?: string
  natalOptions?: NatalReflectionOption[]
  natalRevision?: number
}

function SessionPersonalization({ selection, ...readingProps }: ReadingProps) {
  const [wish, setWish] = useState('')
  const [mission, setMission] = useState('')
  const [outcome, setOutcome] = useState<'' | keyof typeof SESSION_OUTCOMES>('')
  const personalization = wish || mission || outcome ? {
    ...(wish && { wish }), ...(mission && { mission }), ...(outcome && { outcome }),
  } : undefined
  return (
    <>
      <fieldset className="space-y-3 rounded-xl border border-white/15 p-4 text-sm">
        <legend className="px-1 font-medium">Ce qui compte pour ma séance (facultatif)</legend>
        <label className="block">Mon envie du moment
          <input className={fieldClass} type="text" value={wish} maxLength={240}
            placeholder="Par exemple, reprendre le dessin."
            onChange={event => setWish(event.target.value)} />
        </label>
        <label className="block">Ma mission de vie, dans mes mots
          <input className={fieldClass} type="text" value={mission} maxLength={240}
            placeholder="Par exemple, transmettre ce que j’apprends."
            onChange={event => setMission(event.target.value)} />
        </label>
        <div>
          <label className="block" htmlFor="session-outcome">Ce que je veux obtenir</label>
          <select className={fieldClass} id="session-outcome" value={outcome}
            onChange={event => setOutcome(event.target.value as typeof outcome)}>
            <option value="">Sans préférence</option>
            {Object.entries(SESSION_OUTCOMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      </fieldset>
      <SessionReadings key={JSON.stringify([selection.birthDate, selection.asOfDate, selection.mode])}
        {...readingProps} selection={{ ...selection, personalization }} />
    </>
  )
}

function SessionReadings({ selection, question, natalSummary, natalRevision, natalOptions = [] }: ReadingProps) {
  const [rishiNumerology, setRishiNumerology] = useState<RishiNumerologyReading | null>(null)
  const [selected, setSelected] = useState<{ id: string; revision?: number } | null>(null)
  const natal = selected?.revision === natalRevision ? natalOptions.find(option => option.id === selected?.id) : undefined
  const input = {
    ...selection,
    ...(rishiNumerology && selection.mode !== 'practical' && { rishiNumerology }),
    ...(natal && { personalization: { ...selection.personalization, natal } }),
  }
  const groups = [...new Set(natalOptions.map(option => option.group))]
  return (
    <>
      {natalOptions.length > 0 && <div className="space-y-2 rounded-xl border border-violet-200/25 p-4 text-sm">
        <label htmlFor="session-natal-reading" className="font-medium">Repère de mon thème pour cette séance</label>
        <select id="session-natal-reading" className={fieldClass} value={natal?.id ?? ''}
          onChange={event => setSelected({ id: event.target.value, revision: natalRevision })}>
          <option value="">Aucun repère natal</option>
          {groups.map(group => <optgroup key={group} label={group}>
            {natalOptions.filter(option => option.group === group).map(option =>
              <option key={option.id} value={option.id}>{option.label}</option>)}
          </optgroup>)}
        </select>
        {natal && <p className="text-violet-100">{natal.question}</p>}
        {natal?.basis && <details className="text-white/75">
          <summary className="cursor-pointer">Voir les repères utilisés</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{natal.basis.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
        </details>}
      </div>}
      {selection.mode !== 'practical' && <RishiNumerologyInput onChange={setRishiNumerology} />}
      <SessionReview key={JSON.stringify([input, question, natalRevision])}
        selection={input} question={question} natalSummary={natalSummary} />
    </>
  )
}

function SessionReview({ selection, question, natalSummary }: { selection: SpiritualSessionInput; question: string; natalSummary?: string }) {
  const [prepared, setPrepared] = useState<{ input: SpiritualSessionInput; plan: Session } | null>(null)
  const [error, setError] = useState('')

  function compose() {
    const input = { ...selection, asOfDate: selection.asOfDate || localCalendarDate() }
    try {
      const plan = composeSpiritualSession(input)
      setPrepared({ input, plan })
      setError('')
    } catch (cause) {
      setPrepared(null)
      setError(cause instanceof Error ? cause.message : 'Impossible de composer cette séance.')
    }
  }

  const plan = prepared?.plan
  return (
    <>
      <button type="button" className={actionClass} onClick={compose}>Composer ma séance</button>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {prepared && plan && (
        <div className="space-y-4 border-t border-cyan-200/20 pt-5">
          <div aria-live="polite" className="space-y-1">
            <h3 className="text-xl font-semibold">Ma séance composée</h3>
            <p className="text-sm text-cyan-100">{SESSION_FOCUS[plan.focus]} · {selection.minutes} min · {modeNames[plan.mode]} · {guidanceNames[plan.guidance]}</p>
          </div>
          {question && <blockquote className="break-words border-l-2 border-cyan-200/40 pl-3 text-sm text-white/80">{question}</blockquote>}
          <ol className="space-y-2">
            {plan.steps.map(step => (
              <li key={step.id} className="rounded-lg bg-white/[0.05] px-4 py-3 text-sm">
                <span className="mr-3 inline-block font-semibold text-cyan-200">{duration(step.seconds)}</span>{step.text}
              </li>
            ))}
          </ol>
          {plan.starterDraft && <div className="space-y-2 rounded-lg border border-cyan-200/25 p-4">
            <h4 className="font-semibold text-cyan-100">{plan.starterDraft.title}</h4>
            <p className="select-text whitespace-pre-line [overflow-wrap:anywhere] text-sm">{plan.starterDraft.text}</p>
          </div>}
          {plan.cycles && (
            <p className="text-sm">Profection annuelle · maison {plan.cycles.annualProfection.house}
              {plan.cycles.annualProfection.sign ? ` · ${plan.cycles.annualProfection.sign} (${plan.cycles.annualProfection.traditionalRuler})` : ' · ascendant inconnu'}.
              {' '}Horloge cosmique · {plan.cycles.cosmicClock.label} · {plan.cycles.cosmicClock.sign}.</p>
          )}
          {plan.number !== null && (
            <p className="text-sm">Numérologie JYOTI · <strong>{plan.number}</strong>. Cette convention additionne le jour, le mois et l’année, puis réduit le résultat en conservant les nombres maîtres 11, 22 et 33.</p>
          )}
          {plan.rishiNumerology && <p className="text-sm text-violet-100">{describeRishiNumerologyReading(plan.rishiNumerology)}</p>}
          {plan.reflection && <p className="text-sm text-violet-100">{plan.reflection}</p>}
          {plan.needsBirthDate && <p className="text-sm">Pour ajouter la lecture symbolique choisie, renseigne <a className="text-cyan-200 underline" href="#dates-cycles">tes repères de naissance</a>. Ta pratique est déjà disponible.</p>}
          <SpiritualSessionChat key={prepared.input.asOfDate} input={prepared.input} question={question} natalSummary={natalSummary} />
        </div>
      )}
    </>
  )
}
