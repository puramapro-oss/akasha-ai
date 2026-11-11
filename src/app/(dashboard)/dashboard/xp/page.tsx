'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useXPData } from '@/hooks/useXPData'
import { getXPTitle, getXPForNextLevel } from '@/lib/xp'
import XPProfile from '@/components/xp/XPProfile'
import XPStats from '@/components/xp/XPStats'
import XPActions from '@/components/xp/XPActions'
import XPBadges from '@/components/xp/XPBadges'
import XPLeaderboard from '@/components/xp/XPLeaderboard'
import type { LeaderboardTab } from '@/types/xp'

export default function XPPage() {
  const { user, profile } = useAuth()
  const [leaderTab, setLeaderTab] = useState<LeaderboardTab>('alltime')
  const { badges, leaderboard, loadingBadges, loadingLeader } = useXPData(leaderTab)

  const level = profile?.level ?? 1
  const xp = profile?.xp ?? 0
  const nextLevelXP = getXPForNextLevel(level)
  const title = getXPTitle(level)
  const userRank = leaderboard.findIndex((e) => e.id === user?.id) + 1

  return (
    <div className="flex flex-col gap-6" data-testid="xp-page">
      <XPProfile profile={profile} level={level} xp={xp} nextLevelXP={nextLevelXP} title={title} />
      <XPStats xp={xp} level={level} userRank={userRank} />
      <XPActions />
      <XPBadges badges={badges} loading={loadingBadges} />
      <XPLeaderboard
        leaderboard={leaderboard}
        loading={loadingLeader}
        activeTab={leaderTab}
        userId={user?.id}
        onTabChange={setLeaderTab}
      />
    </div>
  )
}
