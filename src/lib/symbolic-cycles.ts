/**
 * Educational symbolic cycles — two distinct historical/spiritual frameworks.
 * No claims about prediction, health, finances, personality or destiny.
 * Date-only input deliberately avoids timezone-dependent midnight arithmetic.
 */
export const ZODIAC_SIGNS = [
  { name: 'Bélier', ruler: 'Mars' },
  { name: 'Taureau', ruler: 'Vénus' },
  { name: 'Gémeaux', ruler: 'Mercure' },
  { name: 'Cancer', ruler: 'Lune' },
  { name: 'Lion', ruler: 'Soleil' },
  { name: 'Vierge', ruler: 'Mercure' },
  { name: 'Balance', ruler: 'Vénus' },
  { name: 'Scorpion', ruler: 'Mars' },
  { name: 'Sagittaire', ruler: 'Jupiter' },
  { name: 'Capricorne', ruler: 'Saturne' },
  { name: 'Verseau', ruler: 'Saturne' },
  { name: 'Poissons', ruler: 'Jupiter' },
] as const

// The Cosmic Clock attributed to Mark and Elizabeth Clare Prophet begins
// at Capricorn at birth, independently of the natal Ascendant.
const COSMIC_CLOCK_SIGNS = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const

export const SYMBOLIC_CYCLE_SOURCES = {
  profections: 'https://www.astro.com/astrology/tma_article190314_e.htm',
  cosmicClock: 'https://www.ascendedmasterencyclopedia.org/wiki/Cosmic_clock',
} as const

export interface SymbolicCycleInput {
  birthDate: string // YYYY-MM-DD — no guessed birth hour
  asOfDate: string // caller's local calendar date, YYYY-MM-DD
  /** Aries=0, Taurus=1 ... Pisces=11. Only supply if Ascendant is known. */
  ascendantSign?: number
}

export interface SymbolicCycleConsent extends SymbolicCycleInput {
  consent: true // explicit, per-request opt-in: never automatically persisted
}

export interface SymbolicCycleSnapshot {
  age: number
  annualProfection: {
    house: number
    sign: string | null
    traditionalRuler: string | null
    requiresAscendant: boolean
  }
  cosmicClock: {
    line: number // 0 corresponds to the twelve o'clock line
    label: string
    sign: string
    revolution: number // first 12-year turn = 1
  }
  note: string
  sources: typeof SYMBOLIC_CYCLE_SOURCES
}

export interface SymbolicTimelineEntry {
  age: number
  annualProfection: SymbolicCycleSnapshot['annualProfection']
  cosmicClock: SymbolicCycleSnapshot['cosmicClock']
}

/** Caller-local calendar date (not UTC, which can shift birthdays by a day). */
export function localCalendarDate(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Eligibility uses the user's ACTUAL current age, never a chosen future
 * reference date. This client-side restriction complements, but does not
 * replace, server-side policy and consent review.
 */
export function isAdultForSymbolicIAO(birthDate: string, onDate: string = localCalendarDate()): boolean {
  return calculateSymbolicCycles({ birthDate, asOfDate: onDate }).age >= 18
}

function parseCalendarDate(value: string, field: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError(`${field}: format AAAA-MM-JJ requis`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`${field}: date invalide`)
  }
  const iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
  if (iso !== value) throw new RangeError(`${field}: date invalide`)
  return { year, month, day }
}

export function calculateSymbolicCycles(input: SymbolicCycleInput): SymbolicCycleSnapshot {
  const birth = parseCalendarDate(input.birthDate, 'birthDate')
  const asOf = parseCalendarDate(input.asOfDate, 'asOfDate')
  if (input.asOfDate < input.birthDate) throw new RangeError('La date de référence précède la naissance')

  let age = asOf.year - birth.year
  if (asOf.month < birth.month || (asOf.month === birth.month && asOf.day < birth.day)) {
    age--
  }
  // On non-leap years, a Feb 29 birthday rolls over on March 1.
  if (age < 0 || age > 130) throw new RangeError('Âge hors plage prise en charge (0 à 130 ans)')

  const asc = input.ascendantSign
  if (asc !== undefined && (!Number.isInteger(asc) || asc < 0 || asc > 11)) {
    throw new RangeError('Ascendant non valide')
  }

  return {
    age,
    ...symbolicYearAtAge(age, asc),
    note: 'Deux traditions distinctes, proposées pour l’étude et la réflexion, sans validité prédictive démontrée.',
    sources: SYMBOLIC_CYCLE_SOURCES,
  }
}

/** Single canonical mapping shared by the present year and future timeline. */
function symbolicYearAtAge(
  age: number,
  ascendantSign?: number
): Pick<SymbolicTimelineEntry, 'annualProfection' | 'cosmicClock'> {
  const line = age % 12
  const profectedSignIndex = ascendantSign === undefined ? undefined : (ascendantSign + line) % 12
  const profectedSign = profectedSignIndex === undefined ? undefined : ZODIAC_SIGNS[profectedSignIndex]
  const cosmicSign = ZODIAC_SIGNS[COSMIC_CLOCK_SIGNS[line]]

  return {
    annualProfection: {
      house: line + 1,
      sign: profectedSign?.name ?? null,
      traditionalRuler: profectedSign?.ruler ?? null,
      requiresAscendant: ascendantSign === undefined,
    },
    cosmicClock: {
      line,
      label: line === 0 ? '12 h' : `${line} h`,
      sign: cosmicSign.name,
      revolution: Math.floor(age / 12) + 1,
    },
  }
}

/**
 * A read-only, 12-year perspective. Future entries are mathematical cycle
 * positions, NOT predictions and do not imply a future personal outcome.
 */
export function getSymbolicCycleTimeline(
  input: SymbolicCycleInput,
  years = 12,
): SymbolicTimelineEntry[] {
  if (!Number.isInteger(years) || years < 1 || years > 24) {
    throw new RangeError('La perspective doit couvrir entre 1 et 24 années entières')
  }
  const snapshot = calculateSymbolicCycles(input)
  const count = Math.min(years, 131 - snapshot.age)
  return Array.from({ length: count }, (_, offset) => {
    const age = snapshot.age + offset
    return { age, ...symbolicYearAtAge(age, input.ascendantSign) }
  })
}

/**
 * Context for IAO, built solely when the person explicitly opted in for this
 * request. We transmit derived information rather than the exact birth date.
 */
export function buildSymbolicIAOContext(input?: SymbolicCycleConsent): string {
  if (!input || input.consent !== true) return ''
  const snapshot = calculateSymbolicCycles(input)
  if (!isAdultForSymbolicIAO(input.birthDate)) {
    throw new RangeError('Le partage de ces résultats avec IAO est réservé aux adultes ; le calcul local reste accessible.')
  }
  const prof = snapshot.annualProfection
  const profDescription = prof.requiresAscendant
    ? `maison ${prof.house} ; signe et maître de l'année indéterminés (Ascendant absent)`
    : `maison ${prof.house}, signe ${prof.sign}, maître traditionnel ${prof.traditionalRuler}`

  return [
    'CONTEXTE ÉDUCATIF SYMBOLIQUE (consentement explicite pour cette requête uniquement).',
    `Âge civil à la date choisie : ${snapshot.age} ans.`,
    `Profections annuelles, tradition hellénistique : ${profDescription}.`,
    `Horloge cosmique (tradition du Summit Lighthouse) : ligne ${snapshot.cosmicClock.label}, signe ${snapshot.cosmicClock.sign}, tour ${snapshot.cosmicClock.revolution}.`,
    'Ne confonds PAS les deux méthodes. Ne déduis pas un ascendant manquant.',
    'Ne présente AUCUNE interprétation comme une certitude sur la personne, ses croyances, sa santé, son destin ou son avenir.',
    'Propose seulement une explication historique, des questions de réflexion libres et des exercices facultatifs.',
    `Sources : ${snapshot.sources.profections} ; ${snapshot.sources.cosmicClock}.`,
  ].join('\n')
}
