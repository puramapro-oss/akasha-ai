import { creativeExercise, SESSION_OUTCOMES } from './session-creation.ts'
export { SESSION_OUTCOMES } from './session-creation.ts'
import { ageAtReferenceDate, calculateSymbolicCycles, isAdultForSymbolicIAO } from './symbolic-cycles.ts'
import { getNumerologyNumber } from './jyoti-numerology.ts'
import { describeRishiNumerologyReading, parseRishiNumerologyReading, type RishiNumerologyReading } from './rishi-numerology-reading.ts'
import type { NatalReflectionOption } from './natal-reflection.ts'

export const SESSION_FOCUS = {
  attention: 'Attention',
  kindness: 'Bienveillance',
  discernment: 'Discernement',
  gratitude: 'Gratitude',
  custom: 'Intention libre',
} as const

export const SESSION_TECHNIQUES = {
  observation: 'Observation attentive',
  writing: 'Écriture personnelle',
  visualization: 'Visualisation',
  kindness: 'Geste de bienveillance',
  mantra: 'Mantra personnel',
  prayer: 'Prière personnelle',
} as const

export type SessionTechnique = keyof typeof SESSION_TECHNIQUES

export interface SessionPersonalization {
  wish?: string
  mission?: string
  outcome?: keyof typeof SESSION_OUTCOMES
  natal?: NatalReflectionOption
}

// These are invitations written for PURAMA. No recorded voice, recitation or tradition is implied.
const techniqueInstructions: Record<SessionTechnique, string> = {
  observation: 'Observe un détail de la scène ou du lieu auquel tu penses. Décris-le intérieurement.',
  writing: 'Écris quelques mots sur ce qui te frappe. Tu peux aussi les formuler intérieurement.',
  visualization: 'Représente-toi un geste simple que tu pourrais essayer. Si tu préfères, décris-le en mots.',
  kindness: 'Imagine une façon concrète de respecter tes limites ou de prendre soin de quelqu’un.',
  mantra: 'Si tu as un mantra que tu souhaites utiliser ici, répète-le intérieurement à ton rythme.',
  prayer: 'Formule intérieurement une prière dans tes propres mots et selon ta tradition.',
}

export interface SpiritualSessionInput {
  mode: 'practical' | 'mixed' | 'spiritual'
  focus: keyof typeof SESSION_FOCUS
  minutes: number
  guidance: 'guided' | 'quiet'
  useAstrology: boolean
  useNumerology: boolean
  rishiNumerology?: RishiNumerologyReading | null
  personalization?: SessionPersonalization
  birthDate?: string
  asOfDate: string
  ascendantSign?: number
  techniques?: SessionTechnique[]
}

// Original PURAMA exercises. Their wording does not attribute beliefs to the user.
const PRACTICES = {
  attention: {
    begin: 'Choisis un détail ordinaire autour de toi et observe-le.',
    explore: 'Reviens à ce détail chaque fois que ton attention part ailleurs. Que remarques-tu maintenant ?',
    quiet: 'Reste en silence avec ce détail.',
    carry: 'Choisis un moment de ta journée où refaire ce geste.',
  },
  kindness: {
    begin: 'Pense à une personne que tu aimerais mieux écouter. Tu peux aussi te choisir.',
    explore: 'Imagine une phrase qui reconnaît son expérience. Essaie de la dire avec tes propres mots.',
    quiet: 'Accorde à cette personne un moment de bienveillance silencieuse.',
    carry: 'Choisis un geste respectueux et faisable, ou garde simplement cette intention.',
  },
  discernment: {
    begin: 'Nomme une décision qui t’occupe et deux possibilités que tu envisages.',
    explore: 'Pour chaque possibilité, relève un fait connu et une information qui te manque.',
    quiet: 'Laisse un moment de silence entre les deux possibilités.',
    carry: 'Choisis une question à vérifier ou un petit essai réversible.',
  },
  gratitude: {
    begin: 'Retrouve un moment précis de ta journée que tu aimerais garder.',
    explore: 'Rappelle-toi un détail de ce moment. Qui ou quoi y a contribué ?',
    quiet: 'Accorde à ce souvenir un temps de silence.',
    carry: 'Garde un mot pour ce moment ou prépare un remerciement, à ton choix.',
  },
  custom: {
    begin: 'Formule ce que tu veux explorer aujourd’hui avec tes propres mots.',
    explore: 'Observe une situation concrète où cette intention compte pour toi. Imagine un premier geste.',
    quiet: 'Garde ton intention à l’esprit pendant ce temps de silence.',
    carry: 'Choisis ce que tu souhaites emporter en quittant la séance.',
  },
} as const

const outcomePrompts = {
  action: ['Imagine un geste assez petit pour être essayé aujourd’hui.', 'Choisis quand tu pourrais essayer ce geste et ce que tu observeras ensuite.'],
  draft: ['À qui ou à quoi destines-tu ta création ? Imagine les premiers mots, le premier trait ou le premier son.', 'Garde une première version, même en une phrase, et choisis le détail à reprendre ensuite.'],
  choice: ['Nomme deux options et un critère personnel pour les départager.', 'Quel fait concret pourrais-tu vérifier avant de choisir ?'],
} as const

function declaredText(value?: string) {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > 240) throw new RangeError('Chaque intention personnelle peut contenir jusqu’à 240 caractères.')
  return value.trim().replace(/\s+/gu, ' ')
}

function personalizePractice(
  steps: { id: string; seconds: number; text: string }[],
  input: SpiritualSessionInput,
) {
  const personal = input.personalization
  if (!personal) return null
  const wish = declaredText(personal.wish)
  const mission = declaredText(personal.mission)
  const outcome = personal.outcome
  if (outcome !== undefined && (typeof outcome !== 'string' || !Object.hasOwn(outcomePrompts, outcome))) {
    throw new RangeError('Choisis un résultat de séance disponible.')
  }
  const natal = input.mode === 'practical' ? undefined : personal.natal
  if (natal && (typeof natal.label !== 'string' || !natal.label.trim() || typeof natal.question !== 'string' || !natal.question.trim())) {
    throw new RangeError('Choisis un repère dans le thème calculé.')
  }
  if (!wish && !mission && !outcome && !natal) return null

  const opening = steps[0]
  const closing = steps[steps.length - 1]
  if (wish) opening.text += ' Pars de ton envie du moment : « ' + wish + ' ».'
  if (mission) opening.text += ' Tu as choisi cette direction : « ' + mission + ' ».'
  if (natal) steps[1].text += ' Repère symbolique choisi · ' + natal.label + '. ' + natal.question

  const target = outcome ?? (wish || mission ? 'action' : undefined)
  if (target) {
    const exercise = creativeExercise(wish, mission, target)
    steps[steps.length - 2].text += ' ' + (exercise.prompt ?? outcomePrompts[target][0])
    closing.text = outcomePrompts[target][1]
    if (mission) closing.text += ' En quoi cela servirait-il la direction que tu as choisie ?'
    return exercise.draft
  }
  return null
}

export function composeSpiritualSession(input: SpiritualSessionInput) {
  if (!input || typeof input.focus !== 'string' || !Object.hasOwn(SESSION_FOCUS, input.focus) ||
      !['practical', 'mixed', 'spiritual'].includes(input.mode) ||
      !['guided', 'quiet'].includes(input.guidance) ||
      typeof input.useAstrology !== 'boolean' || typeof input.useNumerology !== 'boolean' ||
      !Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 30) {
    throw new RangeError('Choisis une intention, un mode, un accompagnement et une durée de 1 à 30 minutes.')
  }

  const astrology = input.mode !== 'practical' && input.useAstrology
  const numerology = input.mode !== 'practical' && input.useNumerology
  const rishiNumerology = input.mode !== 'practical' && input.rishiNumerology != null
    ? parseRishiNumerologyReading(input.rishiNumerology) : null
  if ((astrology || numerology) && input.birthDate !== undefined && typeof input.birthDate !== 'string') {
    throw new RangeError('La date doit être saisie au format AAAA-MM-JJ.')
  }
  if (input.techniques !== undefined && (!Array.isArray(input.techniques) ||
      !Array.from(input.techniques).every(key => typeof key === 'string' && Object.hasOwn(SESSION_TECHNIQUES, key)))) {
    throw new RangeError('Pratique inconnue.')
  }
  const techniques = [...new Set(input.techniques)].filter(key =>
    input.mode !== 'practical' || (key !== 'mantra' && key !== 'prayer'))
  const needsBirthDate = (astrology || numerology) && !input.birthDate
  let cycles = null
  let number = null
  if ((astrology || numerology) && input.birthDate) {
    const dateInput = { birthDate: input.birthDate, asOfDate: input.asOfDate }
    if (astrology) cycles = calculateSymbolicCycles({ ...dateInput, ascendantSign: input.ascendantSign })
    if (numerology) {
      if (!cycles) ageAtReferenceDate(dateInput)
      const [year, month, day] = input.birthDate.split('-').map(Number)
      number = getNumerologyNumber(day, month, year)
    }
  }

  const practice = PRACTICES[input.focus]
  const seconds = input.minutes * 60
  const framingSeconds = input.guidance === 'quiet' ? Math.min(15, seconds / 6) : Math.min(90, seconds / 4)
  const opening = input.mode === 'spiritual'
    ? 'Si tu le souhaites, dédie ce temps à ce qui a du sens pour toi. ' + practice.begin
    : practice.begin
  const practiceSeconds = seconds - 2 * framingSeconds
  const middle = techniques.length ? techniques.map((key, index) => ({
    id: key,
    seconds: Math.floor(practiceSeconds / techniques.length) + (index < practiceSeconds % techniques.length ? 1 : 0),
    text: techniqueInstructions[key],
  })) : [{ id: 'explore', seconds: practiceSeconds, text: input.guidance === 'quiet' ? practice.quiet : practice.explore }]
  const steps = [
    { id: 'begin', seconds: framingSeconds, text: opening },
    ...middle,
    { id: 'carry', seconds: framingSeconds, text: practice.carry },
  ]
  const starterDraft = personalizePractice(steps, input)

  const symbols = []
  if (cycles) symbols.push('la maison ' + cycles.annualProfection.house + ' des profections et la ligne ' + cycles.cosmicClock.label + ' de l’Horloge cosmique')
  if (number !== null) symbols.push('le nombre ' + number + ' de JYOTI')
  if (rishiNumerology) symbols.push('les repères de numérologie RISHI que tu as choisis')
  const reflection = symbols.length ? 'En pensant à ton intention, que t’évoque ' +
    (symbols.length > 1 ? 'chacun de ces repères' : 'cette lecture') + ' (' + symbols.join(' ; ') +
    ') ? Tu peux aussi laisser cette question ouverte.' : null

  return { steps, starterDraft, techniques, cycles, number, rishiNumerology, needsBirthDate, reflection, focus: input.focus, guidance: input.guidance, mode: input.mode }
}

interface SessionChatSelection { question: string; shareIntentions?: boolean; shareNatalReading?: boolean }

/** Local preview for the adult chat flow. Restricted fields are excluded before composing the text. */
export function previewSessionChatContext(input: SpiritualSessionInput, options: SessionChatSelection) {
  if (!input.birthDate || !isAdultForSymbolicIAO(input.birthDate)) {
    throw new RangeError('La séance reste accessible localement. L’envoi depuis cet espace est réservé aux adultes.')
  }
  if (typeof options.question !== 'string' || options.question.length > 1500) throw new RangeError('La demande peut contenir jusqu’à 1 500 caractères.')
  // Recompose the steps from permitted fields. A local exercise can itself quote a private intention.
  const personal = input.personalization
  const sharedPersonal = personal && {
    wish: options.shareIntentions === true ? personal.wish : undefined,
    mission: options.shareIntentions === true ? personal.mission : undefined,
    outcome: options.shareIntentions === true ? personal.outcome : undefined,
    natal: options.shareNatalReading === true && input.mode !== 'practical' ? personal.natal : undefined,
  }
  const plan = composeSpiritualSession({ ...input, personalization: sharedPersonal })
  const lines = [
    'La personne a choisi une séance de ' + input.minutes + ' min. Son intention : ' + SESSION_FOCUS[plan.focus] + '.',
    'Cadre choisi : ' + ({ practical: 'pratique', mixed: 'mixte', spiritual: 'spirituel' })[plan.mode] +
      '. Accompagnement : ' + (plan.guidance === 'quiet' ? 'silence' : 'guidé') + '.',
    ...plan.steps.map(step => step.seconds + ' s · ' + step.text),
  ]
  if (plan.cycles) {
    const { annualProfection, cosmicClock, sources } = plan.cycles
    lines.push('Profections : maison ' + annualProfection.house + (annualProfection.sign
      ? ', signe ' + annualProfection.sign + ', maître traditionnel ' + annualProfection.traditionalRuler
      : ', signe et maître indéterminés') + '. Source : ' + sources.profections,
    'Horloge cosmique : ligne ' + cosmicClock.label + ', signe ' + cosmicClock.sign + '. Source : ' + sources.cosmicClock)
  }
  if (plan.number !== null) lines.push('Numérologie symbolique JYOTI : ' + plan.number +
    '. Convention : addition des trois composantes de la naissance puis réduction, avec conservation de 11, 22 et 33.')
  if (plan.rishiNumerology) lines.push('Numérologie symbolique RISHI (résumé choisi) : ' + describeRishiNumerologyReading(plan.rishiNumerology) + '.')
  if (plan.reflection) lines.push(plan.reflection)
  if (plan.starterDraft) lines.push(plan.starterDraft.title + ' : ' + plan.starterDraft.text)
  if (sharedPersonal?.wish?.trim() || sharedPersonal?.mission?.trim() || sharedPersonal?.outcome || sharedPersonal?.natal) {
    if (sharedPersonal.outcome) lines.push('Résultat demandé : ' + SESSION_OUTCOMES[sharedPersonal.outcome] + '.')
    lines.push('Appuie-toi sur mes mots et sur les contraintes de ma demande. Si je demande une création, donne-moi une première version utilisable. Si je demande une action ou une décision, propose un essai réalisable ou des options que je peux comparer. Laisse-moi corriger ce qui ne me correspond pas. Utilise les repères astrologiques joints comme questions facultatives. Seule la personne peut définir sa mission de vie.')
  }
  lines.push('Réponds à ma demande dans ce cadre, en respectant les méthodes sélectionnées. Distingue les calculs, les traditions et les suggestions. Si la demande dépasse ces méthodes, dis-le. Garde les décisions concrètes fondées sur les faits disponibles.')
  if (options.question.trim()) lines.push('Ma demande : ' + options.question.trim())
  return lines.join('\n')
}

/** Only prepare the outgoing message after explicit consent. */
export function buildSessionChatContext(input: SpiritualSessionInput, options: SessionChatSelection & { consent: boolean }) {
  if (options?.consent !== true) return ''
  return previewSessionChatContext(input, options)
}
