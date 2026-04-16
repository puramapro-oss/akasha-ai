'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  MessageSquare, Wrench, Bot, Store, Zap, Film, Users,
  BarChart3, Gamepad2, Plug, Settings, ChevronLeft, ChevronRight,
  LogOut, Share2, Wallet, Trophy, Bell, BookOpen, Crown, User,
  Gift, Ticket, Megaphone, Shield, Euro, Wind, Heart, ShoppingBag,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'
import LocaleSwitcher from '@/components/shared/LocaleSwitcher'
import { getRandomQuote } from '@/hooks/useAwakening'

type NavSection = {
  title: string
  items: ReadonlyArray<{
    href: string
    icon: React.ComponentType<{ className?: string }>
    key: string
  }>
}

const SECTIONS: ReadonlyArray<NavSection> = [
  {
    title: 'workspace',
    items: [
      { href: '/dashboard/chat', icon: MessageSquare, key: 'chat' },
      { href: '/dashboard/tools', icon: Wrench, key: 'tools' },
      { href: '/dashboard/studio', icon: Film, key: 'studio' },
      { href: '/dashboard/agents', icon: Bot, key: 'agents' },
      { href: '/dashboard/automation', icon: Zap, key: 'automation' },
      { href: '/dashboard/marketplace', icon: Store, key: 'marketplace' },
    ],
  },
  {
    title: 'progress',
    items: [
      { href: '/dashboard/analytics', icon: BarChart3, key: 'analytics' },
      { href: '/dashboard/xp', icon: Gamepad2, key: 'xp' },
      { href: '/dashboard/achievements', icon: Trophy, key: 'achievements' },
      { href: '/dashboard/classement', icon: Crown, key: 'classement' },
      { href: '/dashboard/breathe', icon: Wind, key: 'breathe' },
      { href: '/dashboard/gratitude', icon: Heart, key: 'gratitude' },
    ],
  },
  {
    title: 'rewards',
    items: [
      { href: '/dashboard/daily-gift', icon: Gift, key: 'dailyGift' },
      { href: '/dashboard/concours', icon: Trophy, key: 'concours' },
      { href: '/dashboard/tirage', icon: Ticket, key: 'tirage' },
      { href: '/dashboard/wallet', icon: Wallet, key: 'wallet' },
      { href: '/financer', icon: Euro, key: 'financer' },
      { href: '/dashboard/boutique', icon: ShoppingBag, key: 'boutique' },
    ],
  },
  {
    title: 'community',
    items: [
      { href: '/dashboard/collab', icon: Users, key: 'collab' },
      { href: '/dashboard/partage', icon: Share2, key: 'partage' },
      { href: '/dashboard/referral', icon: Users, key: 'referral' },
      { href: '/dashboard/ambassadeur', icon: Megaphone, key: 'ambassadeur' },
    ],
  },
  {
    title: 'account',
    items: [
      { href: '/dashboard/api', icon: Plug, key: 'api' },
      { href: '/dashboard/notifications', icon: Bell, key: 'notifications' },
      { href: '/dashboard/guide', icon: BookOpen, key: 'guide' },
      { href: '/dashboard/profile', icon: User, key: 'profile' },
      { href: '/dashboard/settings', icon: Settings, key: 'settings' },
    ],
  },
]

const ADMIN_ITEM = { href: '/dashboard/admin', icon: Shield, key: 'admin' } as const

export default function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [quote] = useState(() => getRandomQuote())
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL || profile?.role === 'super_admin'

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/85 backdrop-blur-xl transition-all duration-300 lg:flex',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b border-[var(--border)]', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        <Link href="/dashboard" className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] shadow-[0_4px_14px_-4px_rgba(0,212,255,0.6)]">
            <span className="font-display text-sm font-bold text-white">A</span>
          </div>
          {!collapsed && (
            <span className="font-display text-base font-bold tracking-tight text-[var(--text-primary)]">
              AKASHA
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            aria-label={t('collapseSidebar')}
            data-testid="sidebar-toggle"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          aria-label={t('expandSidebar')}
          data-testid="sidebar-toggle"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            {!collapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {tryTranslate(t, `section.${section.title}`, section.title)}
              </div>
            )}
            {section.items.map(({ href, icon: Icon, key }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`nav-${href.split('/').pop()}`}
                  title={collapsed ? t(key) : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                    collapsed && 'justify-center',
                    active
                      ? 'bg-[var(--cyan)]/10 text-[var(--cyan)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--cyan)]" />
                  )}
                  <Icon className={cn('h-[18px] w-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105', active && 'drop-shadow-[0_0_8px_var(--cyan)]')} />
                  {!collapsed && <span className="truncate">{t(key)}</span>}
                </Link>
              )
            })}
          </div>
        ))}

        {isSuperAdmin && (
          <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
            <Link
              href={ADMIN_ITEM.href}
              data-testid="nav-admin"
              title={collapsed ? t(ADMIN_ITEM.key) : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                collapsed && 'justify-center',
                pathname.startsWith(ADMIN_ITEM.href)
                  ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--gold)]'
              )}
            >
              <Shield className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span className="truncate">{t(ADMIN_ITEM.key)}</span>}
            </Link>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-3">
        {!collapsed && quote && (
          <div className="mb-3 rounded-lg bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] italic text-[var(--text-muted)] leading-relaxed">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">— {quote.author}</p>
          </div>
        )}
        {!collapsed && (
          <div className="mb-2">
            <LocaleSwitcher />
          </div>
        )}
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-semibold text-white">
              {getInitials(profile?.display_name ?? profile?.email ?? null)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {profile?.display_name ?? profile?.email?.split('@')[0] ?? 'Utilisateur'}
              </p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                {tc('level')} {profile?.level ?? 1}
              </p>
            </div>
            <button
              onClick={signOut}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label={tc('logout')}
              data-testid="logout-sidebar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-semibold text-white">
              {getInitials(profile?.display_name ?? profile?.email ?? null)}
            </div>
            <button
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
              aria-label={tc('logout')}
              data-testid="logout-sidebar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Returns translated key, or the fallback if the key is missing. */
function tryTranslate(t: ReturnType<typeof useTranslations>, key: string, fallback: string) {
  try {
    const v = t(key)
    return v && v !== key ? v : fallback
  } catch {
    return fallback
  }
}
