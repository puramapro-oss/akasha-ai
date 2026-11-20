'use client'

import { useState, useCallback } from 'react'
import { ShoppingBag, ArrowLeft, Star, Ticket, Tag, Coins, Zap, Gift } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { toast } from 'sonner'

interface ShopItem {
  id: string
  name: string
  description: string
  cost_points: number
  category: 'reduction' | 'subscription' | 'ticket' | 'feature' | 'cash'
  icon: string
  available: boolean
}

const SHOP_ITEMS: ShopItem[] = [
  { id: 'red-10', name: '-10% sur l\'abonnement', description: 'Reduction de 10% sur ton prochain mois', cost_points: 1000, category: 'reduction', icon: 'tag', available: true },
  { id: 'red-30', name: '-30% sur l\'abonnement', description: 'Reduction de 30% sur ton prochain mois', cost_points: 3000, category: 'reduction', icon: 'tag', available: true },
  { id: 'red-50', name: '-50% sur l\'abonnement', description: 'Reduction de 50% sur ton prochain mois', cost_points: 5000, category: 'reduction', icon: 'tag', available: true },
  { id: 'sub-1m', name: '1 mois gratuit', description: 'Un mois d\'abonnement offert', cost_points: 10000, category: 'subscription', icon: 'zap', available: true },
  { id: 'sub-starter', name: '1 mois Essentiel', description: 'Un mois du plan Essentiel offert', cost_points: 15000, category: 'subscription', icon: 'zap', available: true },
  { id: 'sub-pro', name: '1 mois Pro', description: 'Un mois du plan Pro offert', cost_points: 30000, category: 'subscription', icon: 'star', available: true },
  { id: 'sub-max', name: '1 mois Max', description: 'Un mois du plan Max offert', cost_points: 50000, category: 'subscription', icon: 'star', available: true },
  { id: 'ticket-1', name: '1 ticket tirage', description: 'Un ticket supplementaire pour le tirage mensuel', cost_points: 500, category: 'ticket', icon: 'ticket', available: true },
  { id: 'credits-10', name: '+10 credits IA', description: '10 credits supplementaires pour les generations', cost_points: 2000, category: 'feature', icon: 'coins', available: true },
  { id: 'credits-50', name: '+50 credits IA', description: '50 credits supplementaires pour les generations', cost_points: 8000, category: 'feature', icon: 'coins', available: true },
  { id: 'cash-250', name: '2.50 EUR en wallet', description: 'Conversion 25 000 points → 2.50 EUR', cost_points: 25000, category: 'cash', icon: 'gift', available: true },
  { id: 'cash-500', name: '5 EUR en wallet', description: 'Conversion 50 000 points → 5 EUR', cost_points: 50000, category: 'cash', icon: 'gift', available: true },
  { id: 'cash-1000', name: '10 EUR en wallet', description: 'Conversion 100 000 points → 10 EUR', cost_points: 100000, category: 'cash', icon: 'gift', available: true },
]

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  reduction: { label: 'Reductions', color: 'text-emerald-400' },
  subscription: { label: 'Abonnements', color: 'text-[var(--cyan)]' },
  ticket: { label: 'Tickets', color: 'text-amber-400' },
  feature: { label: 'Credits', color: 'text-purple-400' },
  cash: { label: 'Cash', color: 'text-pink-400' },
}

const ICON_MAP: Record<string, React.ReactNode> = {
  tag: <Tag className="w-5 h-5" />,
  zap: <Zap className="w-5 h-5" />,
  star: <Star className="w-5 h-5" />,
  ticket: <Ticket className="w-5 h-5" />,
  coins: <Coins className="w-5 h-5" />,
  gift: <Gift className="w-5 h-5" />,
}

export default function BoutiquePage() {
  const auth = useAuth()
  return <BoutiquePageContent key={auth.user?.id ?? 'signed-out'} auth={auth} />
}

function BoutiquePageContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { isAuthenticated } = auth
  const [filter, setFilter] = useState<string>('all')
  const [purchasing, setPurchasing] = useState<string | null>(null)

  const userId = auth.user?.id
  const readPoints = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/points/balance', { signal })
    if (!res.ok) throw new Error('Impossible de charger les points')
    const data = (await res.json()) as { balance: number }
    return data.balance ?? 0
  }, [])
  const { data: points, setData: setPoints, error, refetch: fetchPoints, isCurrent } =
    useAsyncResource(isAuthenticated && userId ? userId : null, readPoints, 0)

  const handlePurchase = async (item: ShopItem) => {
    if (!isCurrent() || purchasing) return
    if (points < item.cost_points) {
      toast.error(`Il te manque ${(item.cost_points - points).toLocaleString('fr-FR')} points.`)
      return
    }
    setPurchasing(item.id)
    try {
      const res = await fetch('/api/points/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, cost: item.cost_points }),
      })
      if (!isCurrent()) return
      if (res.ok) {
        setPoints(prev => prev - item.cost_points)
        toast.success(`${item.name} obtenu ! Tu vois ? Tu es capable de tout.`)
      } else {
        const data = (await res.json()) as { error?: string }
        if (!isCurrent()) return
        toast.error(data.error ?? 'Impossible d\'acheter. Reessaie.')
      }
    } catch {
      if (isCurrent()) toast.error('Erreur. Reessaie.')
    } finally {
      setPurchasing(null)
    }
  }

  const filteredItems = filter === 'all' ? SHOP_ITEMS : SHOP_ITEMS.filter(i => i.category === filter)

  if (error) return <div role="alert">Impossible de charger les données. <button onClick={() => void fetchPoints()}>Réessayer</button></div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-[var(--cyan)]" />
            Boutique
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Depense tes points et debloque des avantages.</p>
        </div>
        <Card className="px-5 py-3 text-center">
          <p className="text-xl font-bold text-[var(--cyan)] tabular-nums">{points.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-[var(--text-muted)]">points</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        <button
          onClick={() => setFilter('all')}
          className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            filter === 'all' ? 'bg-[var(--cyan)]/10 text-[var(--cyan)] border border-[var(--cyan)]/20' : 'bg-white/5 text-[var(--text-secondary)] border border-[var(--border)]'
          }`}
        >
          Tout
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              filter === key ? 'bg-[var(--cyan)]/10 text-[var(--cyan)] border border-[var(--cyan)]/20' : 'bg-white/5 text-[var(--text-secondary)] border border-[var(--border)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredItems.map(item => {
          const canAfford = points >= item.cost_points
          const cat = CATEGORY_LABELS[item.category]
          return (
            <Card
              key={item.id}
              data-testid={`shop-${item.id}`}
              className={`p-5 flex flex-col ${!canAfford ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 ${cat?.color ?? 'text-white'}`}>
                  {ICON_MAP[item.icon] ?? <Star className="w-5 h-5" />}
                </div>
                <Badge variant="default" className="text-xs">
                  {cat?.label}
                </Badge>
              </div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-1">{item.name}</h3>
              <p className="text-xs text-[var(--text-muted)] mb-4 flex-1">{item.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--cyan)] tabular-nums">
                  {item.cost_points.toLocaleString('fr-FR')} pts
                </span>
                <Button
                  size="sm"
                  variant={canAfford ? 'primary' : 'secondary'}
                  disabled={!canAfford || purchasing === item.id}
                  loading={purchasing === item.id}
                  onClick={() => void handlePurchase(item)}
                  data-testid={`btn-buy-${item.id}`}
                >
                  {canAfford ? 'Obtenir' : 'Pas assez'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Info */}
      <div className="text-center mt-10">
        <p className="text-xs text-[var(--text-muted)]">
          1 point = 0.01 EUR. Gagne des points : missions, parrainage, streak, partage, achievements.
        </p>
      </div>
    </div>
  )
}
