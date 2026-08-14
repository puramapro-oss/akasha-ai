export const SUPER_ADMIN_EMAIL = 'matiss.frasne@gmail.com'

export const APP_NAME = 'AKASHA AI'
export const APP_SLUG = 'akasha'
export const APP_DOMAIN = 'akasha.purama.dev'
export const APP_COLOR = '#00d4ff'
export const APP_SCHEMA = 'akasha_ai'

export const COMPANY_INFO = {
  name: 'SASU PURAMA',
  address: '8 Rue de la Chapelle, 25560 Frasne',
  country: 'France',
  siret: process.env.NEXT_PUBLIC_SIRET ?? "SIRET en cours d'attribution",
  taxNote: 'TVA non applicable, art. 293 B du CGI',
  dpo: 'matiss.frasne@gmail.com',
}

export const PLAN_LIMITS = {
  free: { daily_questions: 10, label: 'Free', price: 0 },
  automate: {
    essential: { daily_questions: 100, label: 'AUTOMATE Essentiel', price: 700 },
    pro: { daily_questions: 500, label: 'AUTOMATE Pro', price: 1100 },
    max: { daily_questions: -1, label: 'AUTOMATE Max', price: 1600 },
  },
  create: {
    essential: { daily_questions: 100, label: 'CREATE Essentiel', price: 700 },
    pro: { daily_questions: 500, label: 'CREATE Pro', price: 1100 },
    max: { daily_questions: -1, label: 'CREATE Max', price: 1600 },
  },
  build: {
    essential: { daily_questions: 100, label: 'BUILD Essentiel', price: 700 },
    pro: { daily_questions: 500, label: 'BUILD Pro', price: 1100 },
    max: { daily_questions: -1, label: 'BUILD Max', price: 1600 },
  },
  complete: {
    essential: { daily_questions: 300, label: 'COMPLET Essentiel', price: 2200 },
    pro: { daily_questions: 1000, label: 'COMPLET Pro', price: 3300 },
    max: { daily_questions: -1, label: 'COMPLET Max', price: 4400 },
  },
} as const

export const WALLET_MIN_WITHDRAWAL = 5
export const ASSO_PERCENTAGE = 10

export const XP_ACTIONS = {
  daily_login: 10,
  chat_message: 2,
  generate_image: 5,
  generate_video: 10,
  generate_music: 8,
  create_agent: 25,
  publish_agent: 50,
  five_star_review: 20,
  arena_vote: 5,
  complete_workflow: 15,
  invite_friend: 100,
  streak_7: 50,
  streak_30: 200,
} as const

export const XP_TITLES = [
  { min: 1, max: 10, title: 'Explorateur' },
  { min: 11, max: 25, title: 'Createur' },
  { min: 26, max: 50, title: 'Maitre' },
  { min: 51, max: 75, title: 'Legende' },
  { min: 76, max: 100, title: 'Akashique' },
] as const

export const PUBLIC_ROUTES = [
  '/', '/pricing', '/how-it-works', '/ecosystem', '/status', '/changelog',
  '/privacy', '/terms', '/legal', '/offline', '/login', '/signup', '/register',
  '/onboarding', '/mentions-legales', '/politique-confidentialite', '/cgv', '/cgu',
]

// AKASHA models — chaque entrée est un mode reel (route AKASHA vers une variante Claude differente cote serveur).
// 0 facade : tous les modeles listes fonctionnent.
export const AI_MODELS = [
  { id: 'akasha-sonnet', name: 'AKASHA Sonnet', provider: 'akasha', badge: 'LIVE', color: '#00d4ff', description: 'Le plus equilibre — qualite premium, vitesse standard' },
  { id: 'akasha-opus', name: 'AKASHA Opus', provider: 'akasha', badge: 'PRO', color: '#a855f7', description: 'Reflexion profonde — pour les taches complexes' },
  { id: 'akasha-haiku', name: 'AKASHA Haiku', provider: 'akasha', badge: 'FAST', color: '#10b981', description: 'Ultra-rapide — reponses immediates' },
] as const
