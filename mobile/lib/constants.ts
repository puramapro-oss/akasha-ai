export const APP_NAME = 'AKASHA AI'
export const APP_SLUG = 'akasha'
export const APP_DOMAIN = 'akasha.purama.dev'
export const APP_COLOR = '#00d4ff'
export const APP_SCHEMA = 'akasha_ai'
export const SUPER_ADMIN_EMAIL = 'matiss.frasne@gmail.com'

export const COLORS = {
  void: '#03040a',
  bg: '#0a0b12',
  cyan: '#00d4ff',
  pink: '#ff6b9d',
  neon: '#39ff14',
  gold: '#ffd700',
  purple: '#a855f7',
  orange: '#ff6b35',
  white: '#ffffff',
  gray: {
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
} as const

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

export const AI_MODELS = [
  { id: 'akasha-sonnet', name: 'AKASHA Sonnet', badge: 'LIVE', color: '#00d4ff' },
  { id: 'akasha-opus', name: 'AKASHA Opus', badge: 'PRO', color: '#a855f7' },
  { id: 'akasha-haiku', name: 'AKASHA Haiku', badge: 'FAST', color: '#10b981' },
] as const

export const XP_TITLES = [
  { min: 1, max: 10, title: 'Explorateur' },
  { min: 11, max: 25, title: 'Createur' },
  { min: 26, max: 50, title: 'Maitre' },
  { min: 51, max: 75, title: 'Legende' },
  { min: 76, max: 100, title: 'Akashique' },
] as const
