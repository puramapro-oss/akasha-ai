export interface ShopItem {
  id: string
  name: string
  description: string
  cost_points: number
  category: 'reduction' | 'subscription' | 'ticket' | 'feature' | 'cash'
  icon: string
  available: boolean
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'red-10', name: '-10% sur l\'abonnement', description: 'Reduction de 10% sur ton prochain mois', cost_points: 1000, category: 'reduction', icon: 'tag', available: false },
  { id: 'red-30', name: '-30% sur l\'abonnement', description: 'Reduction de 30% sur ton prochain mois', cost_points: 3000, category: 'reduction', icon: 'tag', available: false },
  { id: 'red-50', name: '-50% sur l\'abonnement', description: 'Reduction de 50% sur ton prochain mois', cost_points: 5000, category: 'reduction', icon: 'tag', available: false },
  { id: 'sub-1m', name: '1 mois gratuit', description: 'Un mois d\'abonnement offert', cost_points: 10000, category: 'subscription', icon: 'zap', available: false },
  { id: 'sub-starter', name: '1 mois Essentiel', description: 'Un mois du plan Essentiel offert', cost_points: 15000, category: 'subscription', icon: 'zap', available: false },
  { id: 'sub-pro', name: '1 mois Pro', description: 'Un mois du plan Pro offert', cost_points: 30000, category: 'subscription', icon: 'star', available: false },
  { id: 'sub-max', name: '1 mois Max', description: 'Un mois du plan Max offert', cost_points: 50000, category: 'subscription', icon: 'star', available: false },
  { id: 'ticket-1', name: '1 ticket tirage', description: 'Un ticket supplementaire pour le tirage mensuel', cost_points: 500, category: 'ticket', icon: 'ticket', available: true },
  { id: 'credits-10', name: '+10 credits IA', description: '10 credits supplementaires pour les generations', cost_points: 2000, category: 'feature', icon: 'coins', available: true },
  { id: 'credits-50', name: '+50 credits IA', description: '50 credits supplementaires pour les generations', cost_points: 8000, category: 'feature', icon: 'coins', available: true },
  { id: 'cash-250', name: '2.50 EUR en wallet', description: 'Conversion 25 000 points → 2.50 EUR', cost_points: 25000, category: 'cash', icon: 'gift', available: false },
  { id: 'cash-500', name: '5 EUR en wallet', description: 'Conversion 50 000 points → 5 EUR', cost_points: 50000, category: 'cash', icon: 'gift', available: false },
  { id: 'cash-1000', name: '10 EUR en wallet', description: 'Conversion 100 000 points → 10 EUR', cost_points: 100000, category: 'cash', icon: 'gift', available: false },
]
