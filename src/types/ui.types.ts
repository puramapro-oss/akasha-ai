export interface DailyGift {
  id: string
  user_id: string
  gift_type: string
  gift_value: string
  streak_count: number
  opened_at: string
}

export interface Invoice {
  id: string
  user_id: string
  invoice_number: string
  amount: number
  currency: string
  status: string
  stripe_invoice_id: string | null
  pdf_url: string | null
  created_at: string
}

export interface Withdrawal {
  id: string
  user_id: string
  amount: number
  iban: string
  status: 'pending' | 'processing' | 'completed'
  requested_at: string
}

export interface InfluencerProfile {
  id: string
  user_id: string
  slug: string
  bio: string | null
  social_links: Record<string, string>
  approved: boolean
  tier: string
  created_at: string
}

/** V7 SUPREME: "Ambassadeur" nom UI. Table DB reste influencer_profiles (pas de breaking change). */
export type AmbassadorProfile = InfluencerProfile
export type AmbassadorTier =
  | 'bronze' | 'argent' | 'or' | 'platine' | 'diamant'
  | 'legende' | 'titan' | 'dieu' | 'eternel'

export interface SocialShare {
  id: string
  user_id: string
  share_code: string
  platform_hint: string | null
  shared_at: string
  points_given: number
}

export interface FaqArticle {
  id: string
  category: string
  question: string
  answer: string
  search_keywords: string[]
  view_count: number
  helpful_count: number
}

export interface Contest {
  id: string
  type: string
  period: string
  status: string
  pool_amount: number
  start_date: string
  end_date: string
}

export interface LotteryDraw {
  id: string
  draw_date: string
  pool_amount: number
  status: 'upcoming' | 'live' | 'completed'
}

export interface LotteryTicket {
  id: string
  user_id: string
  draw_id: string
  source: string
  created_at: string
}

export interface UserFeedback {
  id: string
  user_id: string
  rating: number
  comment: string | null
  category: string | null
  points_given: number
  created_at: string
}

export interface ContactMessage {
  name: string
  email: string
  subject: string
  message: string
}

export interface EmailSequence {
  id: string
  user_id: string
  email_type: string
  sent_at: string
  opened: boolean
  clicked: boolean
}

export interface SupportTicket {
  id: string
  user_id: string
  subject: string
  message: string
  status: 'open' | 'in_progress' | 'closed'
  priority: 'low' | 'normal' | 'high'
  created_at: string
}

export type Plan = 'free' | 'automate' | 'create' | 'build' | 'complete'
export type PlanTier = 'essential' | 'pro' | 'max'
export type Theme = 'dark' | 'light' | 'oled'
export type ReferralTier = 'bronze' | 'argent' | 'or' | 'platine' | 'diamant' | 'legende'

export type ProfilType = 'particulier' | 'entreprise' | 'association' | 'etudiant'
export type SituationType = 'salarie' | 'demandeur_emploi' | 'independant' | 'auto_entrepreneur' | 'retraite' | 'rsa' | 'cej' | 'etudiant'
export type DossierStatut = 'en_cours' | 'accepte' | 'refuse' | 'renouveler'
export type MatchLevel = 'probable' | 'possible' | 'verifier'

export interface Aide {
  id: string
  nom: string
  type_aide: 'particulier' | 'entreprise' | 'association'
  profil_eligible: string[]
  situation_eligible: string[]
  montant_max: number
  taux_remboursement: number
  url_officielle: string | null
  description: string | null
  region: string
  handicap_only: boolean
  cumulable: boolean
  renouvellement_auto: boolean
  active: boolean
  created_at: string
}

export interface DossierFinancement {
  id: string
  user_id: string
  aide_id: string
  statut: DossierStatut
  profil_type: string | null
  situation: string | null
  departement: string | null
  handicap: boolean
  pdf_url: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  aide?: Aide
}
