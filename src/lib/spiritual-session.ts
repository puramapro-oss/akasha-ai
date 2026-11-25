import { ageAtReferenceDate, calculateSymbolicCycles, isAdultForSymbolicIAO } from './symbolic-cycles.ts'
import { getNumerologyNumber } from './jyoti-numerology.ts'

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

  const symbols = []
  if (cycles) symbols.push('la maison ' + cycles.annualProfection.house + ' des profections et la ligne ' + cycles.cosmicClock.label + ' de l’Horloge cosmique')
  if (number !== null) symbols.push('le nombre ' + number + ' de JYOTI')
  const reflection = symbols.length ? 'En pensant à ton intention, que t’évoque ' +
    (symbols.length > 1 ? 'chacun de ces repères' : 'cette lecture') + ' (' + symbols.join(' ; ') +
    ') ? Tu peux aussi laisser cette question ouverte.' : null

  return { steps, techniques, cycles, number, needsBirthDate, reflection, focus: input.focus, guidance: input.guidance, mode: input.mode }
}

/** Only the approved plan is shared. Dates and entered Ascendant are not added to the prompt. */
export function buildSessionChatContext(input: SpiritualSessionInput, options: { consent: boolean; question: string }) {
  if (options?.consent !== true) return ''
  if (!input.birthDate || !isAdultForSymbolicIAO(input.birthDate)) {
    throw new RangeError('La séance reste accessible localement. L’envoi depuis cet espace est réservé aux adultes.')
  }
  if (typeof options.question !== 'string' || options.question.length > 1500) throw new RangeError('La demande peut contenir jusqu’à 1 500 caractères.')
  const plan = composeSpiritualSession(input)
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
  if (plan.reflection) lines.push(plan.reflection)
  lines.push('Réponds à ma demande dans ce cadre, en respectant les méthodes sélectionnées. Distingue les calculs, les traditions et les suggestions. Si la demande dépasse ces méthodes, dis-le. Garde les décisions concrètes fondées sur les faits disponibles.')
  if (options.question.trim()) lines.push('Ma demande : ' + options.question.trim())
  return lines.join('\n')
}
