import { AstroTime, Body, Ecliptic, GeoVector, SiderealTime, e_tilt } from 'astronomy-engine'
import { resolveNatalTime } from './natal-civil-time.ts'
import { zodiacOffset, ZODIAC_LABELS, type NatalZodiac } from './natal-zodiac.ts'
import { ZODIAC_SIGNS } from './symbolic-cycles.ts'

export type HouseSystem = 'whole-sign' | 'equal'
export interface NatalInput {
  date: string
  time: string
  zone: string
  latitude?: number
  longitude?: number
  occurrence?: 'earlier' | 'later'
  houseSystem?: HouseSystem
  zodiac?: NatalZodiac
}

const BODIES = [
  [Body.Sun, 'Soleil'], [Body.Moon, 'Lune'], [Body.Mercury, 'Mercure'], [Body.Venus, 'Vénus'],
  [Body.Mars, 'Mars'], [Body.Jupiter, 'Jupiter'], [Body.Saturn, 'Saturne'], [Body.Uranus, 'Uranus'],
  [Body.Neptune, 'Neptune'], [Body.Pluto, 'Pluton'],
] as const
const ASPECTS = [[0, 'Conjonction'], [60, 'Sextile'], [90, 'Carré'], [120, 'Trigone'], [180, 'Opposition']] as const
const DEG = Math.PI / 180
// A display guard near a boundary, not a confidence interval or a guarantee of model accuracy.
const SIGN_GUARD = 0.05
// Against Swiss Ephemeris at 73,417 daily UT samples around the supported
// years, GAST differed by <0.00060° and true obliquity by <0.000024°.
// Use wider allowances when deciding if the rising intersection is stable.
const SIDEREAL_ANGLE_MARGIN = 0.001 * DEG
const OBLIQUITY_MARGIN = 0.00005 * DEG
const degrees = (value: number) => ((value % 360) + 360) % 360

export interface NatalPosition { body: string; label: string; longitude: number | null; signs: number[]; house: number | null }
export interface NatalAspect { first: string; second: string; name: string; orb: number }
export interface NatalChart {
  status: 'chart'
  precision: 'date' | 'time'
  positions: NatalPosition[]
  ascendant: number | null
  ascendantSigns: number[]
  midheaven: number | null
  midheavenSigns: number[]
  cusps: number[]
  aspects: NatalAspect[]
  houseSystem: HouseSystem
  zodiac: NatalZodiac
  ayanamsha: number | null
}
export type NatalResult = NatalChart | { status: 'gap'; choices: string[] } | { status: 'ambiguous'; choices: string[] }

function coveredSigns(start: number, forwardArc = 0) {
  const first = Math.floor((start - SIGN_GUARD) / 30)
  const last = Math.floor((start + forwardArc + SIGN_GUARD) / 30)
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index + 12) % 12)
}

function apparentLongitude(body: Body, instant: AstroTime, offset: number) {
  return degrees(Ecliptic(GeoVector(body, instant, true)).elon - offset)
}

// Horizon and ecliptic intersect along two opposite rays. Keep the one pointing east.
// MC is the ecliptic point whose right ascension equals local apparent sidereal time.
function chartAngles(time: AstroTime, latitude?: number, longitude?: number) {
  if (latitude === undefined || longitude === undefined || Math.abs(latitude) === 90) {
    return { ascendant: null, midheaven: null }
  }
  const theta = (15 * SiderealTime(time) + longitude) * DEG
  const epsilon = e_tilt(time).tobl * DEG
  const midheaven = degrees(Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(epsilon)) / DEG)
  const phi = latitude * DEG
  const x = -(Math.sin(theta) * Math.cos(epsilon) * Math.cos(phi) + Math.sin(phi) * Math.sin(epsilon))
  const y = Math.cos(theta) * Math.cos(phi)
  // A tiny change in either sky orientation can swing the intersection by
  // several signs when the horizon nearly coincides with the ecliptic.
  // The norm of (dx,dy)/dθ is at most |cos φ|, and that for dε is at most 1.
  const intersectionError = Math.abs(Math.cos(phi)) * SIDEREAL_ANGLE_MARGIN + OBLIQUITY_MARGIN
  const unresolvedLongitude = intersectionError >= Math.hypot(x, y) * Math.sin(SIGN_GUARD * DEG)
  // At a grazing rise the east/west choice can also reverse, even when the
  // two planes are distinct. Bound the variation in the east projection.
  const east = -Math.sin(theta) * x + Math.cos(theta) * Math.cos(epsilon) * y
  const eastError = Math.abs(Math.sin(phi)) * Math.sin(epsilon + OBLIQUITY_MARGIN) *
    SIDEREAL_ANGLE_MARGIN + OBLIQUITY_MARGIN
  if (unresolvedLongitude || Math.abs(east) <= eastError) return { ascendant: null, midheaven }
  const ascendant = degrees(Math.atan2(y, x) / DEG + (east < 0 ? 180 : 0))
  return { ascendant, midheaven }
}

function majorAspects(positions: NatalPosition[]) {
  const aspects: NatalAspect[] = []
  for (const [index, first] of positions.entries()) {
    for (const second of positions.slice(index + 1)) {
      if (first.longitude === null || second.longitude === null) continue
      const apart = Math.abs(first.longitude - second.longitude)
      const separation = Math.min(apart, 360 - apart)
      for (const [angle, name] of ASPECTS) {
        const orb = Math.abs(separation - angle)
        if (orb <= 6) aspects.push({ first: first.body, second: second.body, name, orb })
      }
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb)
}

function validateLocation(input: NatalInput) {
  const { latitude, longitude } = input
  if (latitude === undefined && longitude === undefined) return
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError('Renseigne les deux coordonnées : latitude de −90 à 90°, longitude de −180 à 180°.')
  }
}

export function calculateNatalChart(input: NatalInput): NatalResult {
  if (!input || (input.zodiac !== undefined && (typeof input.zodiac !== 'string' || !Object.hasOwn(ZODIAC_LABELS, input.zodiac))) ||
      (input.houseSystem !== undefined && !['whole-sign', 'equal'].includes(input.houseSystem)) ||
      (input.occurrence !== undefined && !['earlier', 'later'].includes(input.occurrence))) {
    throw new RangeError('Paramètres de thème natal invalides.')
  }
  validateLocation(input)
  const civil = resolveNatalTime(input.date, input.time, input.zone)
  if (civil.kind === 'gap') return { status: 'gap', choices: [] }
  if (civil.kind === 'ambiguous' && !input.occurrence) {
    return { status: 'ambiguous', choices: civil.instants.map(date => date.toISOString()) }
  }
  const houseSystem = input.houseSystem ?? 'whole-sign'
  const zodiac = input.zodiac ?? 'tropical'
  const chart: NatalChart = {
    status: 'chart', precision: civil.kind === 'day' ? 'date' : 'time', houseSystem, zodiac, ayanamsha: null,
    positions: [], aspects: [], cusps: [], ascendant: null, midheaven: null, ascendantSigns: [], midheavenSigns: [],
  }
  if (civil.kind === 'day') {
    const start = new AstroTime(civil.instants[0])
    const end = new AstroTime(new Date(civil.instants[1].getTime() - 1))
    const startOffset = zodiacOffset(start, zodiac)
    const endOffset = zodiacOffset(end, zodiac)
    // Both geocentric luminaries advance throughout a civil day in the supported years.
    // Use the complete local day (including clock changes) and preserve zodiac wraparound.
    for (const [body, label] of BODIES.slice(0, 2)) {
      const first = apparentLongitude(body, start, startOffset)
      const arc = degrees(apparentLongitude(body, end, endOffset) - first)
      chart.positions.push({ body, label, longitude: null, house: null, signs: coveredSigns(first, arc) })
    }
    return chart
  }
  const instant = new AstroTime(input.occurrence === 'later' ? civil.instants[civil.instants.length - 1] : civil.instants[0])
  const offset = zodiacOffset(instant, zodiac)
  chart.ayanamsha = offset
  const angles = chartAngles(instant, input.latitude, input.longitude)
  const ascendant = angles.ascendant === null ? null : degrees(angles.ascendant - offset)
  const midheaven = angles.midheaven === null ? null : degrees(angles.midheaven - offset)
  chart.ascendant = ascendant
  chart.midheaven = midheaven
  chart.ascendantSigns = ascendant === null ? [] : coveredSigns(ascendant)
  chart.midheavenSigns = midheaven === null ? [] : coveredSigns(midheaven)
  if (ascendant !== null && (houseSystem === 'equal' || chart.ascendantSigns.length === 1)) {
    const cusp = houseSystem === 'equal' ? ascendant : 30 * Math.floor(ascendant / 30)
    chart.cusps = Array.from({ length: 12 }, (_, index) => degrees(cusp + 30 * index))
  }
  for (const [body, label] of BODIES) {
    const longitude = apparentLongitude(body, instant, offset)
    const distance = chart.cusps.length ? degrees(longitude - chart.cusps[0]) : null
    const nearCusp = distance !== null && (distance % 30 < SIGN_GUARD || 30 - distance % 30 <= SIGN_GUARD)
    const house = distance === null || nearCusp ? null : Math.floor(distance / 30) + 1
    chart.positions.push({ body, label, longitude, signs: coveredSigns(longitude), house })
  }
  chart.aspects = majorAspects(chart.positions)
  return chart
}

/** Coarse symbolic results only. Birth details, degrees and aspect orbs stay on the device. */
export function summarizeNatalChart(chart: NatalChart): string {
  const signNames = (indices: number[]) => indices.map(index => ZODIAC_SIGNS[index].name).join(' ou ')
  const positions = chart.positions.map(p => p.label + ' : ' + signNames(p.signs) + (p.house ? ', maison ' + p.house : ''))
  const lines = ['Thème natal géocentrique · ' + ZODIAC_LABELS[chart.zodiac] + '. Lectures symboliques choisies.', ...positions]
  if (chart.ascendantSigns.length) lines.push('Ascendant : ' + signNames(chart.ascendantSigns))
  if (chart.midheavenSigns.length) lines.push('Milieu du ciel : ' + signNames(chart.midheavenSigns))
  if (chart.cusps.length) lines.push('Maisons : ' + (chart.houseSystem === 'equal' ? 'égales depuis l’ascendant.' : 'signes entiers.'))
  if (chart.precision === 'date') lines.push('Heure inconnue. Les signes alternatifs délimitent les possibilités de la journée.')
  if (chart.aspects.length) {
    const labels = new Map(chart.positions.map(p => [p.body, p.label]))
    lines.push('Aspects majeurs (orbe maximal 6°) : ' + chart.aspects.map(a => a.name + ' ' + labels.get(a.first) + ' / ' + labels.get(a.second)).join(', '))
  }
  lines.push('Présente ces correspondances comme des pistes facultatives. Les préférences et les corrections que la personne exprime priment sur les interprétations.')
  return lines.join('\n')
}
