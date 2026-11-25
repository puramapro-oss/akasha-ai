import { useEffect, useRef, useState } from 'react'
import { NatalPlacePicker } from '@/components/NatalPlacePicker'
import type { NatalInput, NatalResult } from '@/lib/natal-chart'
import { natalReflectionOptions, type NatalReflectionOption } from '@/lib/natal-reflection'
import type { NatalZodiac } from '@/lib/natal-zodiac'
import { ZODIAC_SIGNS } from '@/lib/symbolic-cycles'

type Chart = Extract<NatalResult, { status: 'chart' }>
export type NatalSelection = { summary: string; options: NatalReflectionOption[]; ascendantSign: number | null }

const zodiacNames: Record<NatalZodiac, string> = {
  tropical: 'Tropical',
  lahiri: 'Sidéral · Lahiri',
  'fagan-bradley': 'Sidéral · Fagan-Bradley',
}

const fieldClass = 'mt-1 w-full rounded-lg border border-white/25 bg-[#14141e] p-3 text-white'
const secondaryAction = 'rounded-lg border border-cyan-200/35 px-3 py-2 text-sm text-cyan-100'

function signIndex(longitude: number) {
  return Math.floor(((longitude % 360 + 360) % 360) / 30)
}

function zodiacPoint(longitude: number) {
  const degrees = (longitude % 360 + 360) % 360
  const minutes = Math.floor((degrees % 1) * 60)
  return `${ZODIAC_SIGNS[signIndex(degrees)].name} · ${Math.floor(degrees % 30)}° ${String(minutes).padStart(2, '0')}′`
}

export function NatalChartPanel({ birthDate, onChange }: {
  birthDate: string
  onChange: (selection: NatalSelection | null) => void
}) {
  const [time, setTime] = useState('')
  const [zone, setZone] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [zodiac, setZodiac] = useState<NatalZodiac>('tropical')
  const [houseSystem, setHouseSystem] = useState<'whole-sign' | 'equal'>('whole-sign')
  const [result, setResult] = useState<NatalResult | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])

  function invalidate() {
    revision.current++
    setResult(null)
    setError('')
    setPending(false)
    onChange(null)
  }

  async function calculate(occurrence?: NatalInput['occurrence']) {
    const current = ++revision.current
    setResult(null)
    setError('')
    setPending(true)
    onChange(null)
    try {
      if ((latitude.trim() === '') !== (longitude.trim() === '')) {
        throw new Error('Pour calculer les angles, renseigne la latitude et la longitude ensemble.')
      }
      const { calculateNatalChart, summarizeNatalChart } = await import('@/lib/natal-chart')
      if (current !== revision.current) return
      const input: NatalInput = { date: birthDate, time, zone: zone.trim(), occurrence, houseSystem, zodiac }
      if (latitude.trim()) {
        input.latitude = Number(latitude)
        input.longitude = Number(longitude)
      }
      const next = calculateNatalChart(input)
      setResult(next)
      if (next.status === 'chart') {
        onChange({
          summary: summarizeNatalChart(next),
          options: natalReflectionOptions(next),
          ascendantSign: next.zodiac === 'tropical' && next.ascendantSigns.length === 1 ? next.ascendantSigns[0] : null,
        })
      }
    } catch (reason) {
      if (current === revision.current) setError(reason instanceof Error ? reason.message : 'Le calcul du thème a échoué.')
    } finally {
      if (current === revision.current) setPending(false)
    }
  }

  return (
    <section id="theme-natal" aria-labelledby="natal-title" className="space-y-4 rounded-2xl border border-violet-200/25 bg-violet-200/[0.04] p-5">
      <h2 id="natal-title" className="text-xl font-semibold">Thème natal</h2>
      <p className="text-sm text-white/75">Le calcul utilise la <a href="#dates-cycles" className="underline">date de naissance indiquée plus haut</a>. Si tu ignores l’heure, tu peux explorer les signes possibles du Soleil et de la Lune sur cette journée.</p>
      <NatalPlacePicker onChoose={place => {
        setPlaceName(place.name)
        setLatitude(String(place.latitude))
        setLongitude(String(place.longitude))
        setZone(place.zone)
        invalidate()
      }} />
      {placeName && <p role="status" className="text-sm text-violet-100">Lieu choisi · {placeName}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Heure de naissance
          <input type="time" aria-label="Heure de naissance" aria-describedby="natal-time-help" className={fieldClass} value={time} onChange={event => { setTime(event.target.value); invalidate() }} />
          <span id="natal-time-help" className="mt-1 block text-xs text-white/65">Laisse ce champ vide si elle est inconnue.</span>
        </label>
        <label className="block text-sm">Fuseau du lieu de naissance
          <input className={fieldClass} aria-label="Fuseau du lieu de naissance" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} placeholder="Europe/Paris" value={zone}
            onChange={event => { setZone(event.target.value); setPlaceName(''); invalidate() }} aria-describedby="natal-zone-help" />
        </label>
      </div>
      <p id="natal-zone-help" className="text-xs text-white/70">Indique le fuseau de la ville à la naissance, par exemple Europe/Paris ou America/Montreal. Utilise UTC seulement si l’heure de naissance a été donnée en UTC.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Latitude
          <input type="number" step="any" min="-90" max="90" inputMode="decimal" className={fieldClass}
            value={latitude} onChange={event => { setLatitude(event.target.value); setPlaceName(''); invalidate() }} />
        </label>
        <label className="block text-sm">Longitude
          <input type="number" step="any" min="-180" max="180" inputMode="decimal" className={fieldClass}
            value={longitude} onChange={event => { setLongitude(event.target.value); setPlaceName(''); invalidate() }} />
        </label>
      </div>
      <p className="text-xs text-white/70">Avec une heure connue, les coordonnées du lieu permettent de calculer l’ascendant et les maisons. En degrés décimaux, le sud et l’ouest ont un signe négatif.</p>
      <div>
        <label htmlFor="natal-zodiac" className="block text-sm">Zodiaque</label>
        <select id="natal-zodiac" aria-describedby="natal-zodiac-help" className={fieldClass} value={zodiac} onChange={event => {
          setZodiac(event.target.value as NatalZodiac)
          invalidate()
        }}>
          {Object.entries(zodiacNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <p id="natal-zodiac-help" className="text-xs text-white/70">Les trois conventions observent les mêmes astres. L’origine des signes change. Les décalages sidéraux Lahiri et Fagan-Bradley sont approchés sur la période 1900–2100.</p>
      <div>
        <label htmlFor="natal-houses" className="block text-sm">Système de maisons</label>
        <select id="natal-houses" className={fieldClass} value={houseSystem} onChange={event => {
          setHouseSystem(event.target.value as 'whole-sign' | 'equal')
          invalidate()
        }}>
          <option value="whole-sign">Signes entiers</option>
          <option value="equal">Maisons égales depuis l’ascendant</option>
        </select>
      </div>
      <button type="button" disabled={!birthDate || !zone.trim() || pending} onClick={() => calculate()}
        className="rounded-xl bg-violet-200 px-5 py-3 font-semibold text-slate-950 disabled:opacity-45">
        {pending ? 'Calcul en cours…' : 'Calculer mon thème natal'}
      </button>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {result?.status === 'gap' && <p role="alert">{time
        ? 'Cette heure locale n’existe pas dans le fuseau indiqué. Vérifie l’heure et le fuseau, ou explore la journée en laissant l’heure vide.'
        : 'Cette date civile n’existe pas dans le fuseau indiqué. Vérifie la date de naissance et le fuseau du lieu.'}</p>}
      {result?.status === 'ambiguous' && (
        <div className="space-y-2" role="group" aria-label="Choisir l’occurrence de l’heure locale">
          <p>Cette heure locale s’est produite deux fois. Choisis l’instant correspondant à ton information de naissance.</p>
          <div className="flex flex-wrap gap-2">
            {result.choices.map((instant, index) => (
              <button type="button" className={secondaryAction} key={instant} onClick={() => calculate(index === 0 ? 'earlier' : 'later')}>
                {index === 0 ? 'Première occurrence' : 'Deuxième occurrence'} · {instant.replace('T', ' ').replace(/(?:\.000)?Z$/, ' UTC')}
              </button>
            ))}
          </div>
        </div>
      )}
      {result?.status === 'chart' && <ChartDetails chart={result} hasLocation={latitude.trim() !== '' && longitude.trim() !== ''} />}
    </section>
  )
}

function describePosition(longitude: number | null, signs: number[]) {
  const alternatives = signs.map(index => ZODIAC_SIGNS[index].name).join(' ou ')
  if (longitude === null) return alternatives
  if (signs.length > 1) return zodiacPoint(longitude) + ' · près de la limite (' + alternatives + ')'
  return zodiacPoint(longitude)
}

function ChartDetails({ chart, hasLocation }: { chart: Chart; hasLocation: boolean }) {
  const bodyNames = new Map(chart.positions.map(position => [position.body, position.label]))
  return (
    <div aria-live="polite" className="space-y-3 border-t border-white/20 pt-4">
      <h3 className="text-lg font-semibold">Mon thème natal</h3>
      <p className="text-sm text-violet-100">Convention zodiacale · {zodiacNames[chart.zodiac]}</p>
      {chart.precision === 'date' && <p className="text-sm">Heure inconnue · les signes indiqués couvrent la journée civile. Plusieurs signes signalent un changement possible pendant la journée.</p>}
      <div className="overflow-x-auto">
        <table aria-label="Positions natales" className="w-full text-left text-sm">
          <thead><tr className="border-b border-white/20"><th scope="col" className="py-2">Astre</th><th scope="col">Position · {zodiacNames[chart.zodiac]}</th>{chart.cusps.length > 0 && <th scope="col">Maison</th>}</tr></thead>
          <tbody>{chart.positions.map(position => (
            <tr key={position.body} className="border-b border-white/10">
              <th scope="row" className="py-2 pr-4 font-medium">{position.label}</th>
              <td>{describePosition(position.longitude, position.signs)}</td>
              {chart.cusps.length > 0 && <td>{position.house ?? '—'}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {chart.ascendant !== null && <p className="text-sm">Ascendant calculé · <strong>{describePosition(chart.ascendant, chart.ascendantSigns)}</strong></p>}
      {chart.midheaven !== null && <p className="text-sm">Milieu du ciel · <strong>{describePosition(chart.midheaven, chart.midheavenSigns)}</strong></p>}
      {chart.precision === 'time' && chart.ascendant === null && <p className="text-xs text-white/70">
        {hasLocation
          ? 'À cet endroit et à cet instant, la direction de l’ascendant est indéterminée. Les maisons restent indéterminées aussi.'
          : 'Renseigne les coordonnées du lieu pour calculer l’ascendant, le milieu du ciel et les maisons.'}
      </p>}
      {chart.houseSystem === 'whole-sign' && chart.ascendantSigns.length > 1 && <p className="text-xs text-white/70">
        L’ascendant est proche d’une limite de signe. Les maisons en signes entiers dépendent de ce choix et restent indéterminées.
      </p>}
      {chart.cusps.length > 0 && <details className="text-sm">
        <summary className="cursor-pointer">Débuts des maisons · {chart.houseSystem === 'whole-sign' ? 'signes entiers' : 'maisons égales'}</summary>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">{chart.cusps.map((cusp, index) =>
          <li key={index}>Maison {index + 1} · {zodiacPoint(cusp)}</li>)}</ol>
      </details>}
      {chart.precision === 'time' && <details className="text-sm">
        <summary className="cursor-pointer">Aspects majeurs ({chart.aspects.length}) · orbe maximal de 6°</summary>
        {chart.aspects.length === 0 ? <p className="mt-2">Aucun aspect majeur dans les orbes retenus.</p> :
          <ul className="mt-2 space-y-1">{chart.aspects.map(aspect =>
            <li key={aspect.first + '-' + aspect.second}>{bodyNames.get(aspect.first) ?? aspect.first} · {aspect.name} · {bodyNames.get(aspect.second) ?? aspect.second} (orbe {aspect.orb.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}°)</li>)}</ul>}
      </details>}
      {chart.zodiac !== 'tropical' && <p className="text-xs text-white/75">Les profections de cet écran utilisent un ascendant tropical. Pour utiliser l’ascendant calculé dans les cycles, sélectionne le zodiaque tropical et recalcule.</p>}
      <div className="flex flex-wrap gap-4 text-sm text-cyan-200">
        {chart.zodiac === 'tropical' && chart.ascendantSigns.length === 1 && <a href="#dates-cycles" className="underline">Choisir cet ascendant pour mes cycles</a>}
        <a href="#session-title" className="underline">Revenir à ma séance</a>
      </div>
      <p className="text-xs text-white/65">Les positions sont calculées dans la convention choisie. Leur interprétation astrologique reste symbolique.</p>
    </div>
  )
}
