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
  plan: Plan
  plan_tier: PlanTier
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

export interface Agent {
  id: string
  creator_id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  system_prompt: string
  model: string
  is_active: boolean
  is_public: boolean
  is_verified: boolean
  price: number
  installs: number
  rating: number
  rating_count: number
  category: string | null
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

export type Plan = 'free' | 'automate' | 'create' | 'build' | 'complete'
export type PlanTier = 'essential' | 'pro' | 'max'
export type Theme = 'dark' | 'light' | 'oled'
export type ReferralTier = 'bronze' | 'argent' | 'or' | 'platine' | 'diamant' | 'legende'
