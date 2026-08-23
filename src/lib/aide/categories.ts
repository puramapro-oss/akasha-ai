import type { LucideIcon } from 'lucide-react'
import {
  HelpCircle,
  MessageSquare,
  Sparkles,
  Wrench,
  CreditCard,
  Users,
} from 'lucide-react'

export interface FaqCategory {
  id: string
  label: string
  Icon: LucideIcon
  color: string
}

export const CATEGORIES: FaqCategory[] = [
  { id: 'general', label: 'General', Icon: HelpCircle, color: '#00d4ff' },
  { id: 'chat', label: 'Chat IA', Icon: MessageSquare, color: '#a855f7' },
  { id: 'creation', label: 'Creation', Icon: Sparkles, color: '#f59e0b' },
  { id: 'agents', label: 'Agents', Icon: Wrench, color: '#10b981' },
  { id: 'billing', label: 'Facturation', Icon: CreditCard, color: '#ef4444' },
  { id: 'referral', label: 'Parrainage', Icon: Users, color: '#ec4899' },
  { id: 'wallet', label: 'Wallet', Icon: CreditCard, color: '#3b82f6' },
  { id: 'points', label: 'Points', Icon: Sparkles, color: '#f97316' },
  { id: 'support', label: 'Support', Icon: HelpCircle, color: '#6366f1' },
]
