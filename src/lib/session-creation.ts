export const SESSION_OUTCOMES = {
  action: 'Un premier pas concret',
  draft: 'Une première ébauche',
  choice: 'Une décision à éclairer',
} as const

// These short, explicit French requests choose an exercise about the stated project.
// Unrecognised requests and conflicting qualifications keep the open-ended exercise.
const projectExercises = [
  {
    kind: 'event',
    shortFocus: 'ta rencontre',
    request: /^(?:organiser|preparer|animer|creer|monter) (?:un |une |mon |ma |notre )(?:atelier|rencontre|evenement|conference)\b/,
    draftTitle: 'Invitation à adapter',
    opening: 'Aimeriez-vous y participer ? Dites-moi ce que vous aimeriez y découvrir ou y partager, et quel moment vous conviendrait.',
    action: 'Imagine la première personne que tu inviterais. Quelle question lui poserais-tu pour préparer la rencontre ?',
    draft: 'Prépare une invitation en deux phrases : à qui s’adresse la rencontre et que pourrez-vous y faire ensemble ?',
    choice: 'Compare deux formats de rencontre. Lequel convient au temps et aux personnes dont tu disposes ?',
  },
  {
    kind: 'music',
    shortFocus: 'ta création musicale',
    request: /^(?:composer|ecrire|creer|enregistrer) (?:une? |ma |mon |notre )(?:chanson|morceau|melodie)\b/,
    draftTitle: 'Début de chanson à essayer',
    opening: 'Une voix cherche la première note. Une autre lui répond tout bas.',
    action: 'Essaie un motif de quelques notes ou un rythme que tu pourrais fredonner.',
    draft: 'Imagine un premier vers ou une mélodie de quelques secondes. Donne-lui un titre provisoire.',
    choice: 'Essaie deux rythmes ou deux débuts. Lequel porte le mieux ce que tu veux exprimer ?',
  },
  {
    kind: 'writing',
    shortFocus: 'ton texte',
    request: /^(?:ecrire|rediger|creer) (?:une? |ma |mon |notre )(?:lettre|message|histoire|roman|texte|livre|poeme)\b/,
    draftTitle: 'Premières lignes à adapter',
    opening: 'Tout a commencé par un détail que je voulais garder. Aujourd’hui, je voudrais te le raconter.',
    action: 'Pense à une personne qui te lira. Quelle première phrase aimerais-tu lui faire découvrir ?',
    draft: 'Formule une phrase d’ouverture, puis une seconde qui donne envie de poursuivre. Relis-les ensemble.',
    choice: 'Imagine deux phrases d’ouverture pour le même lecteur. Laquelle donne le ton que tu cherches ?',
  },
  {
    kind: 'visual',
    shortFocus: 'ta création visuelle',
    request: /^(?:dessiner|peindre|illustrer|creer) (?:une? |ma |mon |notre )(?:portrait|paysage|illustration|affiche|tableau|dessin)\b/,
    draftTitle: 'Esquisse écrite',
    opening: 'Au premier plan, un détail occupe presque toute l’image. Une forme plus petite lui répond à l’arrière-plan. Une seule couleur relie les deux.',
    action: 'Choisis un détail de ton sujet et trace ou imagine ses contours en quelques traits.',
    draft: 'Esquisse une composition avec une forme principale et deux couleurs. Choisis ce que le regard devrait découvrir en premier.',
    choice: 'Compare deux cadrages du même sujet. Quel détail veux-tu mettre en avant ?',
  },
] as const

// Interpret a stated meeting format only when it qualifies a single, positive request.
const meetingFormat = /(?:,?\s+)(?:mais\s+)?(?:(?:seulement|uniquement|exclusivement)\s+)?(en visio(?:conf[ée]rence)?|en pr[ée]sentiel)(?:\s+(?:seulement|uniquement|exclusivement))?$/iu

const eventFormats = {
  video: {
    format: 'en visioconférence',
    shortFocus: 'ta rencontre en visio',
    opening: 'Quel créneau vous conviendrait pour participer à distance ? Quelle question aimeriez-vous aborder ensemble ?',
    action: 'Prépare la première question que tu voudrais poser aux personnes réunies en visio.',
    draft: 'Prépare une invitation en deux phrases : quel sera le sujet de la visio et comment les personnes pourront-elles répondre ?',
    choice: 'Pour cette visio, compare deux durées ou deux activités. Laquelle servirait le mieux ton objectif ?',
  },
  inPerson: {
    format: 'en présentiel',
    shortFocus: 'ta rencontre en présentiel',
    opening: 'Quel lieu vous serait accessible et quel créneau vous conviendrait pour y participer ?',
    action: 'Pense à un lieu accessible aux personnes que tu souhaites réunir.',
    draft: 'Prépare une invitation en deux phrases : quel sera le sujet de la rencontre et que faut-il préciser sur le lieu ?',
    choice: 'Pour cette rencontre en présentiel, compare deux lieux possibles selon les besoins des participants.',
  },
} as const

function explicitProject(wish: string) {
  const activity = wish.replace(/^(?:je (?:veux|voudrais|souhaite|désire)|j['’]aimerais)\s+/iu, '').replace(/[ .!?…]+$/u, '')
  const suffix = meetingFormat.exec(activity)
  const subject = suffix ? activity.slice(0, suffix.index).trimEnd() : activity
  const words = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/’/g, "'")
  if (/\b(?:sans|sauf|mais|eviter|evite|pas|non|ni|ou|jamais|hors|refus\w*|interdi\w*|exclu\w*|annuler|renoncer)\b|[.!?]\s+\S/.test(words)) return undefined
  if (suffix && /\b(?:visio(?:conference)?|presentiel|distance|hybride|en ligne|en salle|sur place)\b/.test(words)) return undefined
  const project = projectExercises.find(item => item.request.test(words))
  if (!project || (suffix && project.kind !== 'event')) return undefined
  const format = suffix ? eventFormats[/visio/i.test(suffix[1]) ? 'video' : 'inPerson'] : undefined
  return { project, subject, format }
}

export function creativeExercise(wish: string, mission: string, outcome: keyof typeof SESSION_OUTCOMES) {
  const match = explicitProject(wish)
  const project = match?.project
  let draft = null
  if (outcome === 'draft' && (wish || mission)) {
    const direction = mission ? 'Ma direction : « ' + mission + ' ».' : ''
    if (match && project) {
      const activity = match.subject.charAt(0).toLocaleLowerCase('fr') + match.subject.slice(1)
      const phrase = match.format ? activity + ' ' + match.format.format : activity
      const seed = project.kind === 'event'
        ? 'Bonjour ! J’aimerais ' + phrase + '. ' + (match.format?.opening ?? project.opening)
        : project.opening
      const subject = project.kind === 'event' ? '' : 'Projet : « ' + wish + ' ».'
      draft = { title: project.draftTitle, text: [subject, direction, seed].filter(Boolean).join('\n\n') }
    } else {
      const idea = wish ? 'Mon projet : « ' + wish + ' ».' : ''
      draft = { title: 'Première note d’intention', text: [idea, direction].filter(Boolean).join(' ') }
    }
  }
  return { prompt: match?.format?.[outcome] ?? project?.[outcome], shortFocus: match?.format?.shortFocus ?? project?.shortFocus, draft }
}
