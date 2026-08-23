'use client'

import { useEffect, useState, useCallback } from 'react'
import { Ticket, Gift, Star, TrendingUp, Plus, Sparkles, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { cn, formatDate } from '@/lib/utils'
import { TICKET_SOURCES, PRIZE_DIST, getDaysUntil } from '@/lib/lottery/constants'

interface Draw {
  id: string
  draw_date: string
  pool_amount: number
  status: 'upcoming' | 'live' | 'completed'
}

interface TicketData {
  id: string
  source: string
  created_at: string
}

interface Winner {
  rank: number
  amount_won: number
  user_id: string
  profile?: { display_name: string | null }
}

export default function TiragePage() {
  const { user } = useAuth()
  const [draw, setDraw] = useState<Draw | null>(null)
  const [myTickets, setMyTickets] = useState<TicketData[]>([])
  const [pastWinners, setPastWinners] = useState<Winner[]>([])
  const [totalTickets, setTotalTickets] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!user) return

    // Get upcoming/live draw
    const { data: drawData } = await supabase
      .from('lottery_draws')
      .select('*')
      .in('status', ['upcoming', 'live'])
      .order('draw_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (drawData) {
      setDraw(drawData as Draw)

      // My tickets for this draw
      const { data: ticketsData } = await supabase
        .from('lottery_tickets')
        .select('id, source, created_at')
        .eq('user_id', user.id)
        .eq('draw_id', drawData.id)
        .order('created_at', { ascending: false })

      if (ticketsData) setMyTickets(ticketsData as TicketData[])

      // Total tickets
      const { count } = await supabase
        .from('lottery_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('draw_id', drawData.id)

      setTotalTickets(count ?? 0)
    }

    // Past winners (last completed draw)
    const { data: lastDraw } = await supabase
      .from('lottery_draws')
      .select('id')
      .eq('status', 'completed')
      .order('draw_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDraw) {
      const { data: winners } = await supabase
        .from('lottery_winners')
        .select('rank, amount_won, user_id')
        .eq('draw_id', lastDraw.id)
        .order('rank', { ascending: true })

      if (winners) setPastWinners(winners as Winner[])
    }

    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const daysLeft = draw ? getDaysUntil(draw.draw_date) : 0
  const myChance = totalTickets > 0 ? ((myTickets.length / totalTickets) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
          <Ticket className="h-7 w-7 text-[var(--cyan)]" />
          Tirage Mensuel
        </h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          10 gagnants chaque mois, 4% du CA redistribue
        </p>
      </div>

      {!draw ? (
        <EmptyState
          icon={<Ticket className="h-10 w-10" />}
          title="Aucun tirage en cours"
          description="Le prochain tirage sera annonce bientot"
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="p-4 text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-[var(--cyan)]" />
              <p className="text-2xl font-bold text-[var(--text-primary)]">{daysLeft}j</p>
              <p className="text-xs text-[var(--text-muted)]">Avant le tirage</p>
            </Card>
            <Card className="p-4 text-center">
              <TrendingUp className="mx-auto mb-2 h-6 w-6 text-green-400" />
              <p className="text-2xl font-bold text-[var(--text-primary)]">{draw.pool_amount.toFixed(0)} EUR</p>
              <p className="text-xs text-[var(--text-muted)]">Cagnotte</p>
            </Card>
            <Card className="p-4 text-center">
              <Ticket className="mx-auto mb-2 h-6 w-6 text-yellow-400" />
              <p className="text-2xl font-bold text-[var(--text-primary)]">{myTickets.length}</p>
              <p className="text-xs text-[var(--text-muted)]">Tes tickets</p>
            </Card>
            <Card className="p-4 text-center">
              <Star className="mx-auto mb-2 h-6 w-6 text-purple-400" />
              <p className="text-2xl font-bold text-[var(--text-primary)]">{myChance}%</p>
              <p className="text-xs text-[var(--text-muted)]">Tes chances</p>
            </Card>
          </div>

          {/* How to earn tickets */}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Plus className="h-4 w-4 text-[var(--cyan)]" />
              Comment obtenir des tickets
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Inscription', tickets: '+1' },
                { label: 'Parrainage', tickets: '+2' },
                { label: 'Mission', tickets: '+1' },
                { label: 'Partage', tickets: '+1' },
                { label: 'Avis Store', tickets: '+3' },
                { label: 'Challenge', tickets: '+2' },
                { label: 'Serie 7j', tickets: '+1' },
                { label: 'Serie 30j', tickets: '+5' },
                { label: 'Abonnement', tickets: '+5/mois' },
                { label: '500 points', tickets: '= 1 ticket' },
              ].map(({ label, tickets }) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-sm font-bold text-[var(--cyan)]">{tickets}</p>
                  <p className="text-xs text-[var(--text-muted)]">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* My tickets */}
          <Card className="p-0">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <Ticket className="h-4 w-4 text-yellow-400" />
                Mes tickets ({myTickets.length})
              </h2>
            </div>
            {myTickets.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                Aucun ticket pour ce tirage. Gagne-en en utilisant AKASHA !
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                {myTickets.map((ticket) => {
                  const src = TICKET_SOURCES[ticket.source] ?? { label: ticket.source, color: '#666' }
                  return (
                    <div key={ticket.id} className="flex items-center gap-3 px-5 py-3">
                      <Ticket className="h-4 w-4" style={{ color: src.color }} />
                      <span className="flex-1 text-sm text-[var(--text-primary)]">{src.label}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatDate(ticket.created_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Prize distribution */}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Gift className="h-4 w-4 text-[var(--cyan)]" />
              Repartition des gains (4% du CA)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {PRIZE_DIST.slice(0, 5).map(({ rank, pct }) => (
                <div key={rank} className={cn(
                  'rounded-lg border p-3 text-center',
                  rank === 1 ? 'border-yellow-500/30 bg-yellow-500/10' :
                  rank <= 3 ? 'border-white/10 bg-white/[0.03]' :
                  'border-white/[0.06] bg-white/[0.02]'
                )}>
                  <p className={cn(
                    'text-lg font-bold',
                    rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  )}>#{rank}</p>
                  <p className="text-sm text-[var(--text-muted)]">{pct}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Positions 5 a 10 : entre 0.15% et 0.2% chacune. Gains verses directement sur ton wallet.
            </p>
          </Card>

          {/* Past winners */}
          {pastWinners.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-4 w-4 text-yellow-400" />
                  Derniers gagnants
                </h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {pastWinners.map((winner) => (
                  <div key={`${winner.rank}-${winner.user_id}`} className="flex items-center gap-4 px-5 py-3">
                    <span className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold',
                      winner.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      winner.rank <= 3 ? 'bg-white/10 text-white' :
                      'bg-white/5 text-[var(--text-muted)]'
                    )}>
                      #{winner.rank}
                    </span>
                    <span className="flex-1 text-sm text-[var(--text-primary)]">
                      {winner.profile?.display_name ?? 'Utilisateur'}
                    </span>
                    <span className="text-sm font-bold text-green-400">
                      +{winner.amount_won.toFixed(2)} EUR
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
