export interface Profile {
  id: string
  email?: string
  display_name: string | null
  avatar_url: string | null
  pseudo: string | null
  bio: string | null
  level: number
  xp: number
  xp_title: string
  plan: 'free' | 'automate' | 'create' | 'build' | 'complete'
  plan_tier: 'essential' | 'pro' | 'max'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  onboarding_completed: boolean
  onboarding_use_case: 'automate' | 'create' | 'build' | 'all' | null
  onboarding_level: 'beginner' | 'intermediate' | 'expert' | null
  interests: string[]
  preferred_language: string
  accent_color: string
  tutorial_completed: boolean
  role: 'user' | 'admin' | 'super_admin'
  wallet_balance: number
  referral_code: string | null
  daily_questions: number
  streak_count: number
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string | null
  model: string
  is_favorite: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  model: string | null
  tokens_used: number | null
  created_at: string
}

export interface UsageDaily {
  id: string
  user_id: string
  date: string
  chat_count: number
  image_count: number
  video_count: number
  audio_count: number
  code_count: number
  api_count: number
}

export interface Agent {
  id: string
  creator_id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  system_prompt: string
  model: string
  triggers: Record<string, unknown> | null
  is_active: boolean
  is_public: boolean
  is_verified: boolean
  price: number
  installs: number
  rating: number
  rating_count: number
  category: string | null
  created_at: string
  updated_at: string
}

export interface Generation {
  id: string
  user_id: string
  type: 'image' | 'video' | 'audio' | 'code'
  prompt: string
  model: string | null
  result_url: string | null
  result_text: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  icon: string | null
  type: 'agent' | 'marketplace' | 'quota' | 'xp' | 'system'
  is_read: boolean
  created_at: string
}

export interface Badge {
  id: string
  name: string
  description: string | null
  icon: string | null
  xp_reward: number
  condition_type: string | null
  condition_value: number | null
}

export interface XpLog {
  id: string
  user_id: string
  action: string
  xp_earned: number
  created_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  status: 'pending' | 'active' | 'converted'
  created_at: string
}

export interface Commission {
  id: string
  referrer_id: string
  referred_id: string
  amount: number
  type: string
  status: 'pending' | 'paid'
  created_at: string
}

export interface Achievement {
  id: string
  name: string
  description: string | null
  icon: string | null
  xp_reward: number
  points_reward: number
  condition_type: string | null
  condition_value: number | null
  category: string
}

export interface UserAchievement {
  user_id: string
  achievement_id: string
  earned_at: string
  achievement?: Achievement
}

export interface PuramaPoints {
  id: string
  user_id: string
  balance: number
  lifetime_earned: number
}

export interface PointTransaction {
  id: string
  user_id: string
  amount: number
  type: string
  source: string | null
  description: string | null
  created_at: string
}

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
