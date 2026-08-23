'use client'

import { useEffect, useState } from 'react'
import { Lock, CheckCircle2, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { Achievement, UserAchievement } from '@/types'

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: '#00d4ff' },
  creation: { label: 'Creation', color: '#a855f7' },
  builder: { label: 'Builder', color: '#f59e0b' },
  engagement: { label: 'Engagement', color: '#ef4444' },
  social: { label: 'Social', color: '#10b981' },
  progression: { label: 'Progression', color: '#3b82f6' },
}

export default function AchievementsPage() {
  const { user } = useAuth()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [earned, setEarned] = useState<UserAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [achRes, earnedRes] = await Promise.all([
        supabase.from('achievements').select('*').order('category'),
        supabase.from('user_achievements').select('*').eq('user_id', user.id),
      ])
      if (achRes.data) setAchievements(achRes.data as Achievement[])
      if (earnedRes.data) setEarned(earnedRes.data as UserAchievement[])
      setLoading(false)
    }
    load()
  }, [user, supabase])

  const earnedIds = new Set(earned.map(e => e.achievement_id))
  const categories = [...new Set(achievements.map(a => a.category))]
  const progress = achievements.length > 0 ? Math.round((earned.length / achievements.length) * 100) : 0

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Succes</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            {earned.length}/{achievements.length} debloques
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-32 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-[var(--cyan)]">{progress}%</span>
        </div>
      </div>

      {categories.map(cat => {
        const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, color: '#888' }
        const catAchievements = achievements.filter(a => a.category === cat)
        return (
          <div key={cat}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold" style={{ color: catInfo.color }}>
              <Star className="h-5 w-5" />
              {catInfo.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catAchievements.map(ach => {
                const isEarned = earnedIds.has(ach.id)
                return (
                  <Card
                    key={ach.id}
                    className={cn(
                      'p-4 transition-all',
                      isEarned ? 'border-[var(--cyan)]/20' : 'opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-xl text-2xl',
                        isEarned ? 'bg-[var(--cyan)]/10' : 'bg-white/5'
                      )}>
                        {ach.icon ?? '🏆'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[var(--text-primary)]">{ach.name}</h3>
                          {isEarned ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Lock className="h-4 w-4 text-[var(--text-secondary)]" />
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{ach.description}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="default">+{ach.xp_reward} XP</Badge>
                          {ach.points_reward > 0 && (
                            <Badge variant="default">+{ach.points_reward} pts</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
