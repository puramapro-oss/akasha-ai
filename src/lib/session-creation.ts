export const SESSION_OUTCOMES = {
  action: 'Un premier pas concret',
  draft: 'Une première ébauche',
  choice: 'Une décision à éclairer',
} as const

// These short, explicit French requests choose an exercise about the stated project.
// Unrecognised or qualified requests keep the open-ended exercise.
const projectExercises = [
  {
    kind: 'event',
    request: /^(?:organiser|preparer|animer|creer|monter) (?:un |une |mon |ma |notre )(?:atelier|rencontre|evenement|conference)\b/,
    draftTitle: 'Invitation à adapter',
    opening: 'Aimeriez-vous y participer ? Dites-moi ce que vous aimeriez y découvrir ou y partager, et quel moment vous conviendrait.',
    action: 'Imagine la première personne que tu inviterais. Quelle question lui poserais-tu pour préparer la rencontre ?',
    draft: 'Prépare une invitation en deux phrases : à qui s’adresse la rencontre et que pourrez-vous y faire ensemble ?',
    choice: 'Compare deux formats de rencontre. Lequel convient au temps et aux personnes dont tu disposes ?',
  },
  {
    kind: 'music',
    request: /^(?:composer|ecrire|creer|enregistrer) (?:une? |ma |mon |notre )(?:chanson|morceau|melodie)\b/,
    draftTitle: 'Début de chanson à essayer',
    opening: 'Une voix cherche la première note. Une autre lui répond tout bas.',
    action: 'Essaie un motif de quelques notes ou un rythme que tu pourrais fredonner.',
    draft: 'Imagine un premier vers ou une mélodie de quelques secondes. Donne-lui un titre provisoire.',
    choice: 'Essaie deux rythmes ou deux débuts. Lequel porte le mieux ce que tu veux exprimer ?',
  },
  {
    kind: 'writing',
    request: /^(?:ecrire|rediger|creer) (?:une? |ma |mon |notre )(?:lettre|message|histoire|roman|texte|livre|poeme)\b/,
    draftTitle: 'Premières lignes à adapter',
    opening: 'Tout a commencé par un détail que je voulais garder. Aujourd’hui, je voudrais te le raconter.',
    action: 'Pense à une personne qui te lira. Quelle première phrase aimerais-tu lui faire découvrir ?',
    draft: 'Formule une phrase d’ouverture, puis une seconde qui donne envie de poursuivre. Relis-les ensemble.',
    choice: 'Imagine deux phrases d’ouverture pour le même lecteur. Laquelle donne le ton que tu cherches ?',
  },
  {
    kind: 'visual',
    request: /^(?:dessiner|peindre|illustrer|creer) (?:une? |ma |mon |notre )(?:portrait|paysage|illustration|affiche|tableau|dessin)\b/,
    draftTitle: 'Esquisse écrite',
    opening: 'Au premier plan, un détail occupe presque toute l’image. Une forme plus petite lui répond à l’arrière-plan. Une seule couleur relie les deux.',
    action: 'Choisis un détail de ton sujet et trace ou imagine ses contours en quelques traits.',
    draft: 'Esquisse une composition avec une forme principale et deux couleurs. Choisis ce que le regard devrait découvrir en premier.',
    choice: 'Compare deux cadrages du même sujet. Quel détail veux-tu mettre en avant ?',
  },
] as const

function explicitProject(wish: string) {
  const words = wish.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/’/g, "'")
    .replace(/^(?:je (?:veux|voudrais|souhaite|desire)|j'aimerais)\s+/, '')
  if (/\b(?:sans|sauf|mais|eviter|pas|ni|ou)\b|[.!?]\s+\S/.test(words)) return undefined
  return projectExercises.find(project => project.request.test(words))
}

export function creativeExercise(wish: string, mission: string, outcome: keyof typeof SESSION_OUTCOMES) {
  const project = explicitProject(wish)
  let draft = null
  if (outcome === 'draft' && (wish || mission)) {
    const direction = mission ? 'Ma direction : « ' + mission + ' ».' : ''
    if (project) {
      const activity = wish.replace(/^(?:je (?:veux|voudrais|souhaite|désire)|j['’]aimerais)\s+/iu, '').replace(/[ .!?…]+$/u, '')
      const infinitive = activity.charAt(0).toLocaleLowerCase('fr') + activity.slice(1)
      const seed = project.kind === 'event'
        ? 'Bonjour ! J’aimerais ' + infinitive + '. ' + project.opening
        : project.opening
      const subject = project.kind === 'event' ? '' : 'Projet : « ' + wish + ' ».'
      draft = { title: project.draftTitle, text: [subject, direction, seed].filter(Boolean).join('\n\n') }
    } else {
      const idea = wish ? 'Mon projet : « ' + wish + ' ».' : ''
      draft = { title: 'Première note d’intention', text: [idea, direction].filter(Boolean).join(' ') }
    }
  }
  return { prompt: project?.[outcome], draft }
}
