'use client'

import { useState } from 'react'
import { Megaphone, BarChart3 } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import Tabs from '@/components/ui/Tabs'
import { formatNumber } from '@/lib/utils'
import { APP_DOMAIN } from '@/lib/constants'
import { AMBASSADOR_TIERS } from '@/constants/ambassador'
import { useAmbassadorData } from '@/hooks/useAmbassadorData'
import AmbassadorRegistration from '@/components/ambassadeur/AmbassadorRegistration'
import AmbassadorStatsCards from '@/components/ambassadeur/AmbassadorStatsCards'
import AmbassadorTierProgress from '@/components/ambassadeur/AmbassadorTierProgress'
import AmbassadorLinks from '@/components/ambassadeur/AmbassadorLinks'
import AmbassadorCommissions from '@/components/ambassadeur/AmbassadorCommissions'
import AmbassadorTiersList from '@/components/ambassadeur/AmbassadorTiersList'
import AmbassadorAcademy from '@/components/ambassadeur/AmbassadorAcademy'

export default function AmbassadeurPage() {
  const { ambassador, stats, commissions, loading, registering, register } = useAmbassadorData()
  const [tab, setTab] = useState('stats')

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!ambassador) {
    return <AmbassadorRegistration registering={registering} onRegister={register} />
  }

  const goLink = `https://${APP_DOMAIN}/go/${ambassador.slug}`
  const profileLink = `https://${APP_DOMAIN}/p/${ambassador.slug}`
  const currentTier = AMBASSADOR_TIERS.find(t => t.id === ambassador.tier) ?? AMBASSADOR_TIERS[0]
  const currentIdx = AMBASSADOR_TIERS.findIndex(t => t.id === currentTier.id)
  const nextTier = AMBASSADOR_TIERS[currentIdx + 1] ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Megaphone className="h-7 w-7 text-[var(--cyan)]" />
            Dashboard Ambassadeur
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="cyan">{currentTier.label}</Badge>
            <span className="text-sm text-[var(--text-muted)]">
              Prime palier : {formatNumber(currentTier.prime)} €
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <AmbassadorStatsCards stats={stats} />

      {/* Tier progress */}
      <AmbassadorTierProgress currentTier={currentTier} nextTier={nextTier} stats={stats} />

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'stats', label: 'Liens & Outils' },
          { id: 'commissions', label: 'Commissions' },
          { id: 'paliers', label: 'Paliers' },
          { id: 'academy', label: 'Academy' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'stats' && <AmbassadorLinks goLink={goLink} profileLink={profileLink} />}
      {tab === 'commissions' && <AmbassadorCommissions commissions={commissions} />}
      {tab === 'paliers' && <AmbassadorTiersList currentTier={currentTier} />}
      {tab === 'academy' && <AmbassadorAcademy stats={stats} />}

      {/* Parrainage direct 3 niveaux info (V7 SUPREME §20) */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 h-5 w-5 text-[var(--cyan)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              En plus des paliers, tu touches des commissions à vie
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Niveau 1 (filleul direct) :{' '}
              <span className="font-semibold text-[var(--text-primary)]">50 %</span> de
              l&apos;abonnement à vie · Niveau 2 :{' '}
              <span className="font-semibold text-[var(--text-primary)]">15 %</span> · Niveau
              3 : <span className="font-semibold text-[var(--text-primary)]">7 %</span>.
              Commission après 30 jours d&apos;activité réelle du filleul.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
