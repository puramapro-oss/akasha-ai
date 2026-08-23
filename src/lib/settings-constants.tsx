import { User, Bell, Shield, Palette, CreditCard, Database } from 'lucide-react'

export type Tab = 'profile' | 'notifications' | 'security' | 'appearance' | 'billing' | 'data'

export const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profil', icon: <User className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'security', label: 'Securite', icon: <Shield className="h-4 w-4" /> },
  { id: 'appearance', label: 'Apparence', icon: <Palette className="h-4 w-4" /> },
  { id: 'billing', label: 'Facturation', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'data', label: 'Donnees', icon: <Database className="h-4 w-4" /> },
]

export const ACCENT_COLORS = [
  { name: 'Cyan', value: '#00d4ff', class: 'bg-[#00d4ff]' },
  { name: 'Violet', value: '#8b5cf6', class: 'bg-[#8b5cf6]' },
  { name: 'Rose', value: '#ec4899', class: 'bg-[#ec4899]' },
  { name: 'Vert', value: '#10b981', class: 'bg-[#10b981]' },
  { name: 'Or', value: '#f59e0b', class: 'bg-[#f59e0b]' },
  { name: 'Orange', value: '#f97316', class: 'bg-[#f97316]' },
]

export const NOTIFICATION_LABELS = [
  { key: 'product_updates', label: 'Emails de mise a jour produit' },
  { key: 'agent_notifications', label: 'Notifications push agents' },
  { key: 'quota_alerts', label: 'Alertes quota' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'marketplace_notifications', label: 'Notifications marketplace' },
  { key: 'weekly_digest', label: 'Resume hebdomadaire' },
]

export interface Payment {
  id: string
  amount: number
  status: string
  created_at: string
  invoice_number: string | null
}
