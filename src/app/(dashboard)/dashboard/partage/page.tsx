'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Share2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { cn, formatNumber, copyToClipboard } from '@/lib/utils'
import { APP_DOMAIN } from '@/lib/constants'
import { PLATFORMS } from '@/lib/share/platforms'
import { type ShareStats, trackShare, calculateSharePoints } from '@/lib/share/tracking'

export default function PartagePage() {
  const auth = useAuth()
  return <PartagePageContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function PartagePageContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { user, profile } = auth
  const [copied, setCopied] = useState(false)
  const [supabase] = useState(createClient)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userId = user?.id

  const shareLink = `https://${APP_DOMAIN}/share/${profile?.referral_code ?? ''}`
  const shareText = 'AKASHA AI — L agregateur multi-IA le plus complet. Chat, images, videos, code, agents... tout en un.'

  const readShares = useCallback(async (signal: AbortSignal): Promise<ShareStats> => {
    const { data, error } = await supabase.from('social_shares')
      .select('id, points_given, shared_at').eq('user_id', userId!).abortSignal(signal)
    if (error) throw new Error('Impossible de charger les partages')
    const shares = data ?? []
    const today = new Date().toISOString().split('T')[0]
    return { total_shares: shares.length,
      points_earned: shares.reduce((acc, item) => acc + (item.points_given ?? 0), 0),
      today_shares: shares.filter(item => item.shared_at?.startsWith(today)).length }
  }, [supabase, userId])
  const { data: stats, loading, error, refetch: load, isCurrent } = useAsyncResource(
    userId ?? null, readShares, { total_shares: 0, points_earned: 0, today_shares: 0 },
  )
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareLink)
    if (ok && isCurrent()) {
      setCopied(true)
      toast.success('Lien copie')
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => { if (isCurrent()) setCopied(false) }, 2000)
    }
  }

  const handleShare = async (platformId: string) => {
    if (!user || !isCurrent()) return
    if (stats.today_shares >= 3) {
      toast.error('Maximum 3 partages par jour')
      return
    }
    const platform = PLATFORMS.find(p => p.id === platformId)
    if (!platform) return
    const points = calculateSharePoints(stats.today_shares)
    try {
      await trackShare(supabase, user.id, profile?.referral_code ?? '', platformId, points, platform.name)
      if (!isCurrent()) return
      window.open(platform.getUrl(shareLink, shareText), '_blank', 'noopener,noreferrer')
      toast.info('Ouverture du partage demandée. Vérifie ton solde pour les points.')
      void load()
    } catch {
      if (isCurrent()) toast.error('Impossible de confirmer le suivi du partage.')
    }
  }

  const handleNativeShare = async () => {
    if (!isCurrent()) return
    if (!navigator.share) { void handleCopy(); return }
    try {
      await navigator.share({ title: 'AKASHA AI', text: shareText, url: shareLink })
      if (!isCurrent()) return
      if (user && stats.today_shares < 3) {
        const points = calculateSharePoints(stats.today_shares)
        await trackShare(supabase, user.id, profile?.referral_code ?? '', 'native', points, 'natif')
        if (!isCurrent()) return
        toast.info('Partage transmis à ton appareil. Vérifie ton solde pour les points.')
        void load()
      }
    } catch {
      // The native share dialog can be cancelled by the user.
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) return <div role="alert">{error.message} <button onClick={() => void load()}>Réessayer</button></div>

  const sharesLeft = Math.max(0, 3 - stats.today_shares)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
          <Share2 className="h-7 w-7 text-[var(--cyan)]" />
          Partage & Gagne
        </h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Partage AKASHA et gagne jusqu a 400 points par jour
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{formatNumber(stats.total_shares)}</p>
          <p className="text-xs text-[var(--text-muted)]">Partages total</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[var(--cyan)]">{formatNumber(stats.points_earned)}</p>
          <p className="text-xs text-[var(--text-muted)]">Points gagnes</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {sharesLeft}/3
          </p>
          <p className="text-xs text-[var(--text-muted)]">Partages restants aujourd hui</p>
        </Card>
      </div>

      {/* Share link */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Ton lien de partage</h2>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
            <code className="flex-1 truncate text-sm text-[var(--cyan)]">{shareLink}</code>
          </div>
          <Button onClick={handleCopy} variant="secondary" aria-label="Copier le lien" className="shrink-0">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button onClick={handleNativeShare} className="shrink-0">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Platforms */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Partager via</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => handleShare(platform.id)}
              disabled={sharesLeft === 0}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all',
                sharesLeft > 0
                  ? 'hover:bg-white/[0.05] hover:border-white/10 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              )}
            >
              <platform.icon className="h-5 w-5 shrink-0" style={{ color: platform.color }} />
              <span className="truncate text-sm text-[var(--text-primary)]">{platform.name}</span>
            </button>
          ))}
        </div>
        {sharesLeft === 0 && (
          <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
            Tu as atteint la limite de 3 partages aujourd hui. Reviens demain !
          </p>
        )}
      </Card>

      {/* Rewards info */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Recompenses</h2>
        <div className="space-y-2">
          {[
            { label: '1er partage du jour', value: '+400 points', badge: 'Bonus' },
            { label: '2eme et 3eme partage', value: '+300 points chacun', badge: null },
            { label: 'Ami inscrit via ton lien', value: '+500 points', badge: 'Super bonus' },
            { label: 'Ami qui s abonne', value: '+300 points x2', badge: null },
          ].map(({ label, value, badge }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-primary)]">{label}</span>
                {badge && <Badge variant="default">{badge}</Badge>}
              </div>
              <span className="text-sm font-bold text-[var(--cyan)]">{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
