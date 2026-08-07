'use client'

import { useEffect, useState, useCallback } from 'react'
import { Gift, Sparkles, Flame, Ticket, Tag, CreditCard, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import Confetti from '@/components/shared/Confetti'
import { cn } from '@/lib/utils'

const GIFT_ICONS: Record<string, typeof Gift> = {
  points: Star,
  coupon: Tag,
  ticket: Ticket,
  credits: CreditCard,
}

const GIFT_COLORS: Record<string, string> = {
  points: '#00d4ff',
  coupon: '#a855f7',
  ticket: '#f59e0b',
  credits: '#10b981',
}

interface GiftData {
  id: string
  gift_type: string
  gift_value: string
  streak_count: number
  opened_at: string
  label?: string
}

export default function DailyGiftPage() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [alreadyOpened, setAlreadyOpened] = useState(false)
  const [gift, setGift] = useState<GiftData | null>(null)
  const [streak, setStreak] = useState(0)
  const [opening, setOpening] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [chestState, setChestState] = useState<'closed' | 'shaking' | 'open'>('closed')

  const loadGift = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/daily-gift', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      setAlreadyOpened(data.already_opened)
      setGift(data.gift)
      setStreak(data.streak ?? 0)
      if (data.already_opened) setChestState('open')
    } catch {
      toast.error('Impossible de charger le coffre')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    loadGift()
  }, [loadGift])

  const openChest = async () => {
    if (!session?.access_token || opening || alreadyOpened) return
    setOpening(true)
    setChestState('shaking')

    // Shake animation
    await new Promise(r => setTimeout(r, 1200))

    try {
      const res = await fetch('/api/daily-gift', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Erreur')
        setChestState('closed')
        return
      }

      setChestState('open')
      setGift(data.gift)
      setAlreadyOpened(true)
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 4000)

      const label = data.gift?.label ?? `${data.gift?.gift_type}: ${data.gift?.gift_value}`
      toast.success(`Tu as gagne : ${label}`)
    } catch {
      toast.error('Erreur lors de l ouverture')
      setChestState('closed')
    } finally {
      setOpening(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const GiftIcon = gift ? (GIFT_ICONS[gift.gift_type] ?? Gift) : Gift
  const giftColor = gift ? (GIFT_COLORS[gift.gift_type] ?? '#00d4ff') : '#00d4ff'

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Confetti active={showConfetti} />

      {/* Header */}
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
          <Gift className="h-7 w-7 text-[var(--cyan)]" />
          Coffre Quotidien
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Reviens chaque jour pour ouvrir ton coffre et gagner des recompenses
        </p>
      </div>

      {/* Streak */}
      <Card className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-orange-400" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Serie en cours</p>
            <p className="text-xs text-[var(--text-muted)]">
              {streak >= 7 ? 'Bonus actif : meilleures recompenses' : `Encore ${7 - streak} jour${7 - streak > 1 ? 's' : ''} pour le bonus`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all',
                i < (streak % 7 || (streak >= 7 ? 7 : 0))
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-white/5 text-[var(--text-muted)] border border-white/10'
              )}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </Card>

      {/* Chest */}
      <Card className="flex flex-col items-center gap-6 p-8">
        <button
          onClick={openChest}
          disabled={alreadyOpened || opening}
          className={cn(
            'relative flex h-40 w-40 items-center justify-center rounded-2xl transition-all duration-300',
            chestState === 'closed' && 'bg-gradient-to-br from-[var(--cyan)]/20 to-[var(--purple)]/20 border-2 border-[var(--cyan)]/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(0,212,255,0.2)] cursor-pointer',
            chestState === 'shaking' && 'bg-gradient-to-br from-[var(--cyan)]/30 to-[var(--purple)]/30 border-2 border-[var(--cyan)]/50 animate-[shake_0.3s_ease-in-out_infinite]',
            chestState === 'open' && 'bg-gradient-to-br from-[var(--cyan)]/10 to-[var(--purple)]/10 border-2 border-white/10 cursor-default'
          )}
        >
          {chestState === 'open' && gift ? (
            <div className="flex flex-col items-center gap-2 animate-[fadeInUp_0.5s_ease-out]">
              <GiftIcon className="h-12 w-12" style={{ color: giftColor }} />
              <span className="text-lg font-bold text-[var(--text-primary)]">
                {gift.label ?? `${gift.gift_value}`}
              </span>
            </div>
          ) : (
            <>
              <Gift className={cn(
                'h-16 w-16 text-[var(--cyan)] transition-all',
                chestState === 'shaking' && 'scale-110'
              )} />
              {chestState === 'closed' && (
                <Sparkles className="absolute -right-1 -top-1 h-6 w-6 text-yellow-400 animate-pulse" />
              )}
            </>
          )}
        </button>

        {!alreadyOpened ? (
          <Button
            onClick={openChest}
            disabled={opening}
            className="min-w-[200px]"
          >
            {opening ? 'Ouverture...' : 'Ouvrir le coffre'}
          </Button>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Reviens demain pour un nouveau coffre
          </p>
        )}
      </Card>

      {/* What you can win */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
          Recompenses possibles
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Star, label: '5-100 points', chance: '43%', color: '#00d4ff' },
            { icon: Tag, label: 'Coupon -5% a -50%', chance: '32%', color: '#a855f7' },
            { icon: Ticket, label: 'Ticket tirage', chance: '15%', color: '#f59e0b' },
            { icon: CreditCard, label: '+3 credits', chance: '10%', color: '#10b981' },
          ].map(({ icon: Icon, label, chance, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <Icon className="h-5 w-5 shrink-0" style={{ color }} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
                <p className="text-xs text-[var(--text-muted)]">{chance}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
