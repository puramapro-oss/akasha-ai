'use client'

import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { getInitials, formatNumber } from '@/lib/utils'

interface UserProfile {
  display_name: string | null
}

interface XPProfileProps {
  profile: UserProfile | null
  level: number
  xp: number
  nextLevelXP: number
  title: string
}

export default function XPProfile({ profile, level, xp, nextLevelXP, title }: XPProfileProps) {
  const progress = Math.min((xp / nextLevelXP) * 100, 100)

  return (
    <Card className="p-6" data-testid="xp-profile-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xl font-bold text-white">
          {getInitials(profile?.display_name ?? null)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              {profile?.display_name ?? 'Utilisateur'}
            </h1>
            <Badge variant="cyan">{title}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Niveau {level} &bull; {formatNumber(xp)} XP
          </p>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>{formatNumber(xp)} XP</span>
              <span>
                {formatNumber(nextLevelXP)} XP pour niv. {level + 1}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
