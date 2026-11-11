'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MessageSquare, Wrench, Store, User, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard/chat', icon: MessageSquare, key: 'chat' },
  { href: '/dashboard/tools', icon: Wrench, key: 'tools' },
  { href: '/dashboard/entraide', icon: Target, key: 'entraide' },
  { href: '/dashboard/marketplace', icon: Store, key: 'market' },
  { href: '/dashboard/profile', icon: User, key: 'profile' },
] as const

export default function BottomTabBar() {
  const pathname = usePathname()
  const t = useTranslations('tabs')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-[var(--border)] bg-[var(--bg-base)]/90 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigation principale"
    >
      {TABS.map(({ href, icon: Icon, key }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            data-testid={`tab-${href.split('/').pop()}`}
            className={cn(
              'group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-all duration-200',
              active
                ? 'text-[var(--cyan)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {active && (
              <span className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-[var(--cyan)]" />
            )}
            <Icon className={cn(
              'h-[20px] w-[20px] transition-transform duration-200',
              active && 'drop-shadow-[0_0_8px_var(--cyan)] scale-110'
            )} />
            <span className="truncate">{t(key)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
