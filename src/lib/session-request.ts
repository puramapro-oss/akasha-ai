import type { SpiritualSessionInput } from './spiritual-session.ts'

type Preferences = Pick<SpiritualSessionInput, 'focus' | 'minutes' | 'guidance' | 'mode' | 'useAstrology' | 'useNumerology'>
type Choice = 'focus' | 'guidance' | 'mode'
type Rule<K extends Choice> = readonly [Preferences[K], RegExp]

const focusRules: Rule<'focus'>[] = [
  ['attention', /\b(attention|concentration|me concentrer|me recentrer)\b/],
  ['kindness', /\b(compassion|bienveillance|gentillesse)\b/],
  ['discernment', /\b(discernement|(?:preparer|prendre|eclairer|peser) (?:une|ma|cette) decision|y voir plus clair)\b/],
  ['gratitude', /\b(gratitude|remercier|reconnaissance envers)\b/],
]
const guidanceRules: Rule<'guidance'>[] = [
  ['quiet', /\b(silence|silencieu(?:x|se)|en autonomie)\b/],
  ['guided', /\b(guide[ez]?[- ]moi|guidee?s?|pas a pas|guidage)\b/],
]
const practicalMode = /\b(?:mode (?:factuel|pratique|laique)|(?:pratique|seance|approche|lecture) (?:non[- ]religieuse|laique)|exercice non[- ]religieux)\b/
const modeRules: Rule<'mode'>[] = [
  ['practical', practicalMode],
  ['mixed', /\bmode mixte\b/],
  ['spiritual', /\bmode spirituel\b/],
]
const methods = {
  useAstrology: /\b(?:astrologie|astro|horoscopes?)\b/,
  useNumerology: /\bnumerologie\b/,
} as const

const writtenNumbers = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt', 'vingt et une', 'vingt-deux', 'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept', 'vingt-huit', 'vingt-neuf', 'trente']
const numberWords = new Map(writtenNumbers.map((word, index) => [word, index]))
numberWords.set('une', 1)
numberWords.set('vingt et un', 21)
const frenchNumber = /\b(?:\d+|zero|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille)\b/

function duration(fragment: string): number | undefined {
  const units = /(?:minutes?|mins?|mn)\b/g
  const found = units.exec(fragment)
  if (!found || units.test(fragment)) return
  if (/[a-z]/.test(fragment[found.index - 1] ?? '')) return
  const before = fragment.slice(0, found.index).trim()
  const after = fragment.slice(found.index + found[0].length).trim()
  // Keep ranges, approximations, compound durations, and out-of-range values for manual choice.
  if (/\b(?:entre|environ|presque|minimum|maximum|au moins|au plus|plus de|moins de|en moins de|max|min|ou)\b|[+#~/]|\d\s*-\s*\d/.test(before)
    || /\b(?:heures?|secondes?)\b/.test(fragment)
    || /^(?:a|ou|maximum|minimum|environ|max|min)\b|^et\s+(?:demi|\d)/.test(after)
    || frenchNumber.test(after.split(' ')[0])) return
  // Take the longest recognised written number, refusing unrecognised numeric prefixes.
  const tail = before.split(/\s+/)
  for (let size = Math.min(4, tail.length); size > 0; size--) {
    const words = tail.slice(-size).join(' ')
    const key = words.replace(/vingt-et-(un|une)$/, 'vingt et $1').replace(/^(dix|vingt) (\w+)$/, '$1-$2')
    const value = /^\d+$/.test(words) ? Number(words) : numberWords.get(key)
    if (value === undefined) continue
    const prefix = tail.slice(0, -size).join(' ')
    if (/\b(?:a|et|de)$/.test(prefix)) {
      const preceding = tail[tail.length - size - 2] ?? ''
      if (frenchNumber.test(preceding)) return
    }
    if (frenchNumber.test(tail[tail.length - size - 1] ?? '')) return
    return value >= 1 && value <= 30 ? value : undefined
  }
}

// A negative span blocks a choice. A method requires an explicit inclusion or exclusion.
const negative = /\bn'(?=\w+\s+pas\b)|\b(?:ne|sans|ni|pas|aucune?|evite[rz]?|exclu(?:re|s)|retire[rz]?|desactive[rz]?|refuse[rz]?)\b/
const alternatives = /\b(?:ou|soit|au choix|eventuellement|imagine|supposons)\b/
const trailingRejection = /\b(?:non souhait|a eviter|a exclure|ne m'interesse pas|ne me convient pas)/
const uncertain = /\b(?:pas (?:sans|seulement|uniquement|forcement|contre)|pas de (?:preference|probleme)|sans (?:exclure|eviter|retirer|refuser|rapport)|(?:ne |n')(?:retire|desactive|refuse|supprime|exclu)\w* pas|si jamais|peut-etre|j'hesite)\b/
const inclusion = /\b(?:combine[rz]?|associe[rz]?|inclu(?:s|re)|inclus|integre[rz]?|ajoute[rz]?|active[rz]?|utilise[rz]?|essayer|avec)\s+(?:(?:les? |la |l'|de |d'|mon |ma |notre |a la fois ))*(?:astrologie|astro|horoscope|numerologie)\b/
const selection = /(?:^\s*(?:avec|combine|associe|inclu|integre|ajoute|active|utilise)|\b(?:je (?:veux|souhaite|prefere|voudrais)|j'aimerais|seance|pratique|peux[- ]tu|pouvez[- ]vous))\b/
const reported = /\b(?:selon|citation|exemple|si (?:je|tu|on)|(?:il|elle|on) (?:me |m')?(?:dit|veut|demande|prefere)|(?:a|m'a) (?:dit|demande|ecrit)|(?:mon|ma|son|sa) [a-z]+ (?:souhaite|veut|dit|demande|prefere))\b/
const informational = /\b(?:tradu(?:is|ire)|resume(?:r)?|corrige(?:r)?|recette|cuire|programme(?:r)? (?:un|une)|ecris[- ](?:moi )?(?:un|une)|explique[- ]moi|qu'est[- ]ce|que (?:signifie|veut dire)|(?:est[- ]ce que|pourquoi)|comment (?:cuisiner|traduire|fonctionne|marche))\b/
const practice = /\b(?:seance|pratique|medit\w*|contemplat\w*|concentr\w*|recentre\w*|discernement|compassion|bienveillance|gratitude|silence|silencieu\w*|mode (?:mixte|spirituel|factuel|pratique|laique)|decision|guid(?:age|ee?)|astrolog\w*|horoscope|numerologie)\b/

function choose<K extends Choice>(rules: Rule<K>[], wanted: string[], excluded: string[]): Preferences[K] | undefined {
  const values = rules.filter(([, rule]) => wanted.some(part => rule.test(part)))
  if (values.length !== 1 || excluded.some(part => values[0][1].test(part))) return
  return values[0][0]
}

/** Suggestions for explicit French session preferences; callers review and apply them locally. */
export function suggestSessionPreferences(text: string): Partial<Preferences> {
  if (typeof text !== 'string' || text.length > 2000) return {}
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'").replace(/[-‐‑–—]/g, '-')
    .replace(/«[^»]*(?:»|$)|“[^”]*(?:”|$)|"[^"]*(?:"|$)/g, ' ')
    .replace(/(\d)[.,](?=\d)/g, '$1#').replace(/\bpas a pas\b/g, 'guidage progressif')
  // A polite request to perform the session differs from a question about what a practice means.
  const direct = normalized.split(/[.!?;\n]+/)
    .map(part => part.replace(/^\s*est[- ]ce que (?:tu (?:peux|pourrais)|vous (?:pouvez|pourriez)) (?=(?:combiner|associer|ajouter|integrer|inclure|utiliser|preparer)\b)/, 'peux-tu '))
    .filter(part => !reported.test(part) && !informational.test(part))
  const sessionSentences = direct.filter(part => practice.test(part))
  if (!sessionSentences.length) return {}
  const wanted: string[] = []
  const excluded: string[] = []
  const inclusions: string[] = []
  const durations: (number | undefined)[] = []
  for (const sentence of direct) {
    // Subsequent shorthand (e.g. “Dix minutes.”) is safe in an explicit session request.
    if (!sessionSentences.includes(sentence) && !/^\s*(?:[a-z-]+(?: et une?)?|\d+)\s*(?:minutes?|mins?|mn)\s*$/u.test(sentence)) continue
    for (const fragment of sentence.split(/\s*,\s*|\b(?:mais|puis|pour|pendant|durant)\b|\bet (?=avec\b|en mode\b|je\b|j')/)) {
      if (uncertain.test(fragment) || alternatives.test(fragment)) continue
      if (trailingRejection.test(fragment)) {
        excluded.push(fragment)
        continue
      }
      const negation = negative.exec(fragment)
      const positive = negation ? fragment.slice(0, negation.index) : fragment
      wanted.push(positive)
      if (selection.test(fragment) || selection.test(sentence)) {
        const include = inclusion.exec(positive)
        if (include) inclusions.push(positive.slice(include.index))
      }
      if (negation) excluded.push(fragment.slice(negation.index))
      if (/(?:minutes?|mins?|mn)\b/.test(fragment)) {
        durations.push(negation && /\b(?:minutes?|mins?|mn)\b/.test(fragment.slice(negation.index)) ? undefined : duration(positive))
      }
    }
  }
  const result: Partial<Preferences> = {}
  const focus = choose(focusRules, wanted, excluded)
  const guidance = choose(guidanceRules, wanted, excluded)
  const mode = choose(modeRules, wanted, excluded)
  if (focus) result.focus = focus
  if (guidance) result.guidance = guidance
  if (mode) result.mode = mode
  if (durations.length && durations[0] !== undefined && durations.every(n => n === durations[0])) result.minutes = durations[0]
  const requestsPracticalMode = wanted.some(part => practicalMode.test(part))
  for (const key of ['useAstrology', 'useNumerology'] as const) {
    const rule = methods[key]
    const hasExclusion = excluded.some(part => rule.test(part))
    if (requestsPracticalMode) result[key] = false
    else if (hasExclusion && !wanted.some(part => rule.test(part))) result[key] = false
    else if (!hasExclusion && inclusions.some(part => rule.test(part))) result[key] = true
  }
  const hasModeRequest = modeRules.some(([, rule]) => wanted.some(part => rule.test(part)) || excluded.some(part => rule.test(part)))
  if (!hasModeRequest && (result.useAstrology || result.useNumerology)) result.mode = 'mixed'
  return result
}
