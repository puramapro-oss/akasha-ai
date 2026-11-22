'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Gift, Sparkles, Flame, Ticket, Tag, CreditCard, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource, ASYNC_RESOURCE_TIMEOUT_MS } from '@/hooks/useAsyncResource'
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
  delivery_status?: 'delivered' | 'pending_coupon_activation'
  delivery_details?: { code?: string; expires_at?: string }
}

type GiftPresentation = { owner: () => boolean; chest: 'closed' | 'shaking' | 'open'; confetti: boolean }
type OpeningOperation = { owner: () => boolean; cancel: () => void }

export default function DailyGiftPage() {
  const auth = useAuth()
  return <DailyGiftPageContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function DailyGiftPageContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { session } = auth
  const token = session?.access_token
  const [pending, setPending] = useState<{ owner: () => boolean } | null>(null)
  const [presentation, setPresentation] = useState<GiftPresentation | null>(null)
  const operation = useRef<OpeningOperation | null>(null)
  const confettiTimer = useRef<{ owner: () => boolean; timer: ReturnType<typeof setTimeout> } | null>(null)
  const readGift = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/daily-gift', { signal, headers: { Authorization: 'Bearer ' + token } })
    const data = await res.json()
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Impossible de charger le coffre')
    return { alreadyOpened: !!data.already_opened, gift: (data.gift ?? null) as GiftData | null, streak: data.streak ?? 0 }
  }, [token])
  const { data, loading: reading, error, refetch: loadGift, setData, isCurrent } = useAsyncResource(
    auth.user?.id && token ? auth.user.id : null, readGift,
    { alreadyOpened: false, gift: null as GiftData | null, streak: 0 },
  )
  const { alreadyOpened, gift, streak } = data
  const loading = auth.loading || reading
  const opening = pending?.owner === isCurrent
  const currentPresentation = presentation?.owner === isCurrent ? presentation : null
  const showConfetti = currentPresentation?.confetti ?? false
  const chestState = alreadyOpened ? 'open' : currentPresentation?.chest ?? 'closed'
  useEffect(() => () => {
    if (operation.current?.owner === isCurrent) operation.current.cancel()
    if (confettiTimer.current?.owner === isCurrent) {
      clearTimeout(confettiTimer.current.timer)
      confettiTimer.current = null
    }
  }, [isCurrent])

  const openChest = async () => {
    if (!token || !isCurrent() || opening || alreadyOpened || loading || error
      || operation.current?.owner === isCurrent) return
    operation.current?.cancel()
    const controller = new AbortController()
    let shakeTimer: ReturnType<typeof setTimeout> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    let finishShake: (completed: boolean) => void = () => undefined
    let rejectCancellation!: (reason: Error) => void
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject })
    const cancel = (reason: Error) => {
      controller.abort()
      clearTimeout(shakeTimer)
      clearTimeout(deadline)
      finishShake(false)
      rejectCancellation(reason)
    }
    const job = { owner: isCurrent, cancel: () => cancel(new Error('Ouverture annulée')) }
    operation.current = job
    setPending({ owner: isCurrent })
    setPresentation({ owner: isCurrent, chest: 'shaking', confetti: false })

    try {
      const request = async () => {
        // Keep the existing animation. Cancellation settles it as well as a
        // transport that ignores AbortSignal or never finishes its JSON body.
        const completed = await new Promise<boolean>(finish => {
          finishShake = finish
          shakeTimer = setTimeout(() => finish(true), 1200)
        })
        if (!completed || !isCurrent() || controller.signal.aborted) throw new Error('Ouverture annulée')
        deadline = setTimeout(() => cancel(new Error('Confirmation indisponible')), ASYNC_RESOURCE_TIMEOUT_MS)
        const res = await fetch('/api/daily-gift', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + token },
        })
        return { res, data: await res.json() }
      }
      const { res, data } = await Promise.race([request(), cancellation])
      clearTimeout(deadline)
      if (!isCurrent() || operation.current !== job) return

      if (!res.ok) {
        toast.error(data.error ?? 'Erreur')
        setPresentation({ owner: isCurrent, chest: 'closed', confetti: false })
        // An infrastructure error can lose a reply after SQL committed. Read
        // the durable receipt before offering another attempt; 409 stays explicit.
        if (res.status >= 500) await loadGift()
        return
      }

      const pendingCoupon = data.gift?.delivery_status === 'pending_coupon_activation'
      const celebrate = !pendingCoupon && data.replayed !== true
      setPresentation({ owner: isCurrent, chest: 'open', confetti: celebrate })
      setData(previous => ({ ...previous, gift: data.gift, alreadyOpened: true, streak: data.streak ?? previous.streak }))
      if (pendingCoupon) {
        toast.info('Coupon enregistre. Son activation est en attente : la reduction n’est pas encore utilisable.')
      } else if (celebrate) {
        if (confettiTimer.current) clearTimeout(confettiTimer.current.timer)
        const timer = setTimeout(() => {
          if (confettiTimer.current?.timer === timer) confettiTimer.current = null
          if (isCurrent()) setPresentation(previous => previous?.owner === isCurrent ? { ...previous, confetti: false } : previous)
        }, 4000)
        confettiTimer.current = { owner: isCurrent, timer }
        const label = data.gift?.label ?? `${data.gift?.gift_type}: ${data.gift?.gift_value}`
        toast.success(`Tu as gagne : ${label}`)
      }
    } catch {
      if (!isCurrent() || operation.current !== job) return
      clearTimeout(deadline)
      setPresentation({ owner: isCurrent, chest: 'closed', confetti: false })
      toast.error('Confirmation indisponible. Vérification du coffre avant de réessayer.')
      // A network failure is not proof that SQL rolled back. This bounded read
      // recovers a committed gift and exposes a retry if verification also fails.
      await loadGift()
    } finally {
      clearTimeout(shakeTimer)
      clearTimeout(deadline)
      controller.abort()
      if (operation.current === job) {
        operation.current = null
        if (isCurrent()) setPending(null)
      }
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

  if (error) return <div role="alert">{error.message} <button onClick={() => void loadGift()}>Réessayer</button></div>

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

      {gift?.delivery_status === 'pending_coupon_activation' && (
        <Card role="status" className="space-y-2">
          <p>Coupon enregistré. Son activation est en attente : cette réduction n’est pas encore utilisable.</p>
          {gift.delivery_details?.code && <p className="break-all">Référence : <code>{gift.delivery_details.code}</code></p>}
        </Card>
      )}

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
          aria-label={alreadyOpened ? 'Coffre déjà ouvert' : 'Ouvrir le coffre'}
          aria-busy={opening}
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
            { icon: Star, label: '5-100 points', chance: streak >= 7 ? '43%' : '45%', color: '#00d4ff' },
            { icon: Tag, label: streak >= 7 ? 'Coupon -5% a -50% (activation en attente)' : 'Coupon -5% a -20% (activation en attente)', chance: streak >= 7 ? '32%' : '30%', color: '#a855f7' },
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
