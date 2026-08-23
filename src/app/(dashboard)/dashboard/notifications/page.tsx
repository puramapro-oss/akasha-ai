'use client'

import { useEffect, useState } from 'react'
import { BellOff, Check, CheckCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate, cn } from '@/lib/utils'
import type { Notification } from '@/types'

const ICON_MAP: Record<string, string> = {
  agent: '🤖',
  marketplace: '🏪',
  quota: '📊',
  xp: '⭐',
  system: '🔔',
  referral: '👥',
  wallet: '💰',
  achievement: '🏆',
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    supabase.from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[])
        setLoading(false)
      })
  }, [user, supabase])

  const unreadCount = notifications.filter(n => !n.is_read).length

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    toast.success('Toutes les notifications lues')
  }

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Notifications</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est lu'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead} icon={<CheckCheck className="h-4 w-4" />}>
            Tout marquer lu
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-12 w-12" />}
          title="Aucune notification"
          description="Tes notifications apparaitront ici"
        />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={cn(
                'flex items-start gap-4 p-4 transition-all',
                !n.is_read && 'border-[var(--cyan)]/20 bg-[var(--cyan)]/[0.02]'
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">
                {ICON_MAP[n.type ?? 'system'] ?? '🔔'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-[var(--text-primary)]">{n.title}</h3>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-[var(--cyan)]" />}
                </div>
                {n.body && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{n.body}</p>}
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDate(n.created_at)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.is_read && (
                  <button onClick={() => markAsRead(n.id)} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--cyan)]" title="Marquer lu">
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => deleteNotification(n.id)} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-400" title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
