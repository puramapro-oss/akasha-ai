import type { LucideIcon } from 'lucide-react'
import { Crown, Medal, Award } from 'lucide-react'

export interface RankPrize {
  rank: number
  pct: string
  icon: LucideIcon
  color: string
}

export const RANK_PRIZES: RankPrize[] = [
  { rank: 1, pct: '2%', icon: Crown, color: '#f59e0b' },
  { rank: 2, pct: '1%', icon: Medal, color: '#94a3b8' },
  { rank: 3, pct: '0.7%', icon: Medal, color: '#cd7f32' },
  { rank: 4, pct: '0.5%', icon: Award, color: '#00d4ff' },
  { rank: 5, pct: '0.4%', icon: Award, color: '#00d4ff' },
  { rank: 6, pct: '0.3%', icon: Award, color: '#a855f7' },
  { rank: 7, pct: '0.28%', icon: Award, color: '#a855f7' },
  { rank: 8, pct: '0.28%', icon: Award, color: '#a855f7' },
  { rank: 9, pct: '0.27%', icon: Award, color: '#a855f7' },
  { rank: 10, pct: '0.27%', icon: Award, color: '#a855f7' },
]

export function getTimeLeft(endDate: string): string {
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return 'Termine'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}j ${hours}h`
  const minutes = Math.floor((diff % 3600000) / 60000)
  return `${hours}h ${minutes}min`
}

export const SCORE_MULTIPLIERS = [
  { label: 'Parrainage', pts: 'x10', color: '#00d4ff' },
  { label: 'Abo converti', pts: 'x50', color: '#a855f7' },
  { label: 'Jour actif', pts: 'x5', color: '#10b981' },
  { label: 'Mission', pts: 'x3', color: '#f59e0b' },
]
