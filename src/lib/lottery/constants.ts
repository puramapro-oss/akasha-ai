export const TICKET_SOURCES: Record<string, { label: string; color: string }> = {
  inscription: { label: 'Inscription', color: '#00d4ff' },
  parrainage: { label: 'Parrainage', color: '#a855f7' },
  mission: { label: 'Mission', color: '#10b981' },
  partage: { label: 'Partage', color: '#f59e0b' },
  note: { label: 'Avis Store', color: '#ef4444' },
  challenge: { label: 'Challenge', color: '#3b82f6' },
  streak: { label: 'Serie', color: '#f97316' },
  abo: { label: 'Abonnement', color: '#8b5cf6' },
  achat_points: { label: 'Achat points', color: '#06b6d4' },
  daily_gift: { label: 'Coffre', color: '#eab308' },
}

export const PRIZE_DIST = [
  { rank: 1, pct: '1.2%' },
  { rank: 2, pct: '0.8%' },
  { rank: 3, pct: '0.6%' },
  { rank: 4, pct: '0.4%' },
  { rank: 5, pct: '0.2%' },
  { rank: 6, pct: '0.2%' },
  { rank: 7, pct: '0.15%' },
  { rank: 8, pct: '0.15%' },
  { rank: 9, pct: '0.15%' },
  { rank: 10, pct: '0.15%' },
]

export function getDaysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}
