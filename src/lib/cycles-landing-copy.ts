export interface CyclesLandingCopy {
  seoTitle: string
  seoDescription: string
  heroKicker: string
  heroTitle: string
  heroHighlight: string
  heroDescription: string
  explore: string
  discover: string
  sourceLabel: string
  originsLabel: string
  caution: string
  featureTitle: string
  privacyTitle: string
  privacyDescription: string
  privacyLink: string
  homeLink: string
  cardSources: string
  methods: { number: string; title: string; origin: string; content: string }[]
  features: { title: string; content: string }[]
}

export const CYCLES_LANDING_COPY: Record<'fr' | 'en', CyclesLandingCopy> = {
  fr: {
    seoTitle: 'Cycles symboliques : profections et Horloge cosmique | AKASHA',
    seoDescription: 'Comprendre les profections annuelles et l’Horloge cosmique : deux traditions distinctes, leurs origines, leurs cycles et leurs limites.',
    heroKicker: 'TRADITIONS · HISTOIRE · EXPLORATION',
    heroTitle: 'Deux traditions. Douze années.',
    heroHighlight: 'Ta liberté d’explorer.',
    heroDescription: 'Découvre comment les profections annuelles et l’Horloge cosmique représentent le passage des années. Comprends leurs origines et leurs différences, puis approfondis librement avec IAO.',
    explore: 'Ouvrir le calculateur',
    discover: 'Découvrir AKASHA',
    sourceLabel: 'Lire une source sur la méthode',
    originsLabel: 'Origines des deux traditions',
    caution: 'Les traditions présentées constituent des approches symboliques et spirituelles ; elles ne prédisent pas scientifiquement les événements de la vie.',
    featureTitle: 'Une découverte à ton rythme',
    privacyTitle: 'Vie privée d’abord',
    privacyDescription: 'Ce lien public ne transmet ni date de naissance, ni signe, ni résultats personnels. Sur le calculateur, toute demande d’interprétation par IAO nécessite un accord explicite.',
    privacyLink: 'Confidentialité',
    homeLink: 'Accueil',
    cardSources: 'Sources, pas preuves d’un pouvoir prédictif',
    methods: [
      { number: '01', title: 'Les profections annuelles', origin: 'Astrologie hellénistique', content: 'À la naissance, la maison I est activée. À chaque anniversaire, la profection avance d’une maison. Le signe et son maître planétaire traditionnel dépendent de l’Ascendant natal connu.' },
      { number: '02', title: 'L’Horloge cosmique', origin: 'Enseignements de Mark et Elizabeth Clare Prophet', content: 'Cette tradition spirituelle commence au Capricorne sur la ligne des 12 heures, puis avance d’une ligne par an. Elle est distincte de l’astrologie traditionnelle.' },
    ],
    features: [
      { title: '12 ans, un cycle', content: 'À 0, 12 ou 24 ans, une profection annuelle revient en maison I.' },
      { title: 'Deux méthodes, des règles distinctes', content: 'Les profections dépendent de l’Ascendant ; l’Horloge cosmique commence en Capricorne.' },
      { title: 'Réfléchir sans se laisser définir', content: 'Aucun signe ou cycle ne détermine tes croyances, ta santé, tes choix ou ton avenir.' },
    ],
  },
  en: {
    seoTitle: 'Symbolic cycles: annual profections and the Cosmic Clock | AKASHA',
    seoDescription: 'Discover annual profections and the Cosmic Clock: two distinct traditions, their origins, cycles and limitations.',
    heroKicker: 'TRADITIONS · HISTORY · EXPLORATION',
    heroTitle: 'Two traditions. Twelve years.',
    heroHighlight: 'Your freedom to explore.',
    heroDescription: 'Discover how annual profections and the Cosmic Clock symbolize the passing years. Understand their origins and differences, then explore them at your own pace with IAO.',
    explore: 'Open the cycle explorer',
    discover: 'Discover AKASHA',
    sourceLabel: 'Read about this method',
    originsLabel: 'Origins of the two traditions',
    caution: 'These traditions describe symbolic and spiritual approaches. They do not scientifically predict personal life events.',
    featureTitle: 'Explore at your own pace',
    privacyTitle: 'Privacy first',
    privacyDescription: 'This public link includes no date of birth, zodiac sign or personal results. In the private explorer, sharing derived results with IAO requires explicit consent.',
    privacyLink: 'Privacy policy',
    homeLink: 'Home',
    cardSources: 'Sources are not evidence of predictive power',
    methods: [
      { number: '01', title: 'Annual profections', origin: 'Hellenistic astrology', content: 'The first year begins in whole-sign house I. At each birthday, the profection advances by one house. The activated sign and its traditional planetary ruler depend on a known natal rising sign.' },
      { number: '02', title: 'The Cosmic Clock', origin: 'Teachings of Mark and Elizabeth Clare Prophet', content: 'This spiritual tradition starts in Capricorn on the 12 o’clock line and advances by one line each year. It is different from traditional astrology.' },
    ],
    features: [
      { title: 'A twelve-year cycle', content: 'At age 0, 12 or 24, annual profections return to the first house.' },
      { title: 'Two methods with different rules', content: 'Profections depend on the rising sign; the Cosmic Clock starts in Capricorn.' },
      { title: 'Reflection without labels', content: 'No sign or symbolic cycle can determine your beliefs, health, decisions or future.' },
    ],
  },
}

export function getCyclesLandingCopy(locale: string): CyclesLandingCopy {
  return locale.toLowerCase().startsWith('fr') ? CYCLES_LANDING_COPY.fr : CYCLES_LANDING_COPY.en
}
