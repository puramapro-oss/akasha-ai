export interface AmbassadorData {
  slug: string
  bio: string | null
  social_links: Record<string, string>
  approved: boolean
  tier: string
  kit_downloaded: boolean
  created_at: string
}

export interface AmbassadorStats {
  clicks: number
  signups: number
  conversions: number
  revenue: number
  conversion_rate: number
}

export interface CommissionRow {
  id: string
  amount: number
  type: string
  status: string
  created_at: string
  referred?: { display_name: string | null }
}

export interface AmbassadorTier {
  id: string
  label: string
  min: number
  prime: number
  color: string
  perk: string
}
