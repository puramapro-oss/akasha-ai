import { calculateNatalChartAtInstant, type NatalChart, type NatalInput, type NatalResult } from './natal-chart.ts'
import { resolveNatalTime, TIME_MARGINS, type TimeMargin } from './natal-civil-time.ts'
import { natalReflectionOptions } from './natal-reflection.ts'
import { ZODIAC_LABELS } from './natal-zodiac.ts'
import { zodiacSignNames } from './symbolic-cycles.ts'

export interface NatalTimeWindow {
  status: 'estimated'
  minutes: TimeMargin
  samples: number
  zodiac: NatalChart['zodiac']
  positions: Pick<NatalChart['positions'][number], 'body' | 'label' | 'signs'>[]
  ascendantSigns: number[]
  midheavenSigns: number[]
}

type TimeWindowResult = NatalTimeWindow | Exclude<NatalResult, NatalChart>

function mergeSigns(target: number[], observations: number[]) {
  for (const sign of observations) if (!target.includes(sign)) target.push(sign)
}

// The interval is elapsed UTC time, even if a clock jumps or repeats inside it.
function* sampleTimeWindow(input: NatalInput, minutes: TimeMargin): Generator<void, TimeWindowResult> {
  if (!TIME_MARGINS.includes(minutes)) throw new RangeError('Marge de temps invalide.')
  if (!input.time) throw new RangeError('Indique une heure approximative pour explorer la fourchette.')
  const civil = resolveNatalTime(input.date, input.time, input.zone)
  if (civil.kind === 'gap') return { status: 'gap', choices: [] }
  if (civil.kind === 'ambiguous' && !input.occurrence) {
    return { status: 'ambiguous', choices: civil.instants.map(date => date.toISOString()) }
  }
  const anchor = civil.instants[input.occurrence === 'later' ? civil.instants.length - 1 : 0].getTime()
  const start = anchor - minutes * 60_000
  const end = anchor + minutes * 60_000
  if (input.date.startsWith('1900') || input.date.startsWith('2100')) {
    const year = new Intl.DateTimeFormat('en', { timeZone: input.zone, year: 'numeric' })
    if (+year.format(start) < 1900 || +year.format(end) > 2100) throw new RangeError('La fourchette dépasse la période de calcul 1900–2100.')
  }
  const result: NatalTimeWindow = {
    status: 'estimated', zodiac: input.zodiac ?? 'tropical', minutes, samples: 0,
    positions: [], ascendantSigns: [], midheavenSigns: [],
  }
  let lastAscendant: number | null = null
  let hasAscendant = true
  let hasMidheaven = true
  for (let t = start; t <= end; t += 60_000) {
    const chart = calculateNatalChartAtInstant(input, new Date(t))
    for (const [i, p] of chart.positions.entries()) {
      result.positions[i] ??= { body: p.body, label: p.label, signs: [] }
      mergeSigns(result.positions[i].signs, p.signs)
    }
    // Near a polar grazing rise the two horizon intersections can exchange
    // roles between samples. A step spanning a full sign cannot resolve it.
    if (lastAscendant !== null && chart.ascendant !== null) {
      const change = Math.abs(chart.ascendant - lastAscendant)
      if (Math.min(change, 360 - change) >= 30) hasAscendant = false
    }
    lastAscendant = chart.ascendant
    hasAscendant &&= chart.ascendant !== null
    hasMidheaven &&= chart.midheaven !== null
    mergeSigns(result.ascendantSigns, chart.ascendantSigns)
    mergeSigns(result.midheavenSigns, chart.midheavenSigns)
    result.samples++
    if (result.samples % 8 === 0 && t < end) yield
  }
  if (!hasAscendant) result.ascendantSigns = []
  if (!hasMidheaven) result.midheavenSigns = []
  return result
}

export function calculateNatalTimeWindow(input: NatalInput, minutes: TimeMargin) {
  const samples = sampleTimeWindow(input, minutes)
  let step = samples.next()
  while (!step.done) step = samples.next()
  return step.value
}

// Let the browser paint and accept edits between batches. An obsolete reading
// must never replace the result or the sharing choices for the new inputs.
export async function readNatalTimeWindow(input: NatalInput, minutes: TimeMargin, isCurrent: () => boolean) {
  const samples = sampleTimeWindow(input, minutes)
  while (isCurrent()) {
    const step = samples.next()
    if (step.done) return step.value
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return null
}

export function selectionFromTimeWindow(window: NatalTimeWindow) {
  const margin = 'Heure estimée à ±' + window.minutes + ' minutes'
  const description = margin + '. Signes observés à intervalles d’une minute, bornes comprises.'
  const options = natalReflectionOptions({
    ...window, precision: 'estimated', positions: window.positions.map(p => ({ ...p, longitude: null, house: null })),
    cusps: [], aspects: [], houseSystem: 'whole-sign',
  }).map(option => ({ ...option, question: description + ' ' + option.question }))
  const lines = [description, 'Convention zodiacale · ' + ZODIAC_LABELS[window.zodiac],
    ...window.positions.map(p => p.label + ' · ' + zodiacSignNames(p.signs))]
  if (window.ascendantSigns.length) lines.push('Ascendant · ' + zodiacSignNames(window.ascendantSigns))
  if (window.midheavenSigns.length) lines.push('Milieu du ciel · ' + zodiacSignNames(window.midheavenSigns))
  lines.push('Propose ces repères comme des pistes symboliques. La personne choisit ce qui lui convient.')
  return { summary: lines.join('\n'), options, ascendantSign: null }
}
