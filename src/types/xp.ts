export interface BadgeItem {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  xp_reward: number
  condition_type: string | null
  condition_value: number | null
  earned?: boolean
  earned_at?: string | null
}

export interface LeaderboardEntry {
  id: string
  display_name: string | null
  avatar_url: string | null
  level: number
  xp: number
}

export type LeaderboardTab = 'alltime' | 'month' | 'week'
