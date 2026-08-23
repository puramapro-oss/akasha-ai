import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TABS, type Tab } from '@/lib/settings-constants'

interface SettingsTabsProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onSignOut: () => void
}

export default function SettingsTabs({ activeTab, onTabChange, onSignOut }: SettingsTabsProps) {
  return (
    <nav
      className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:w-48 lg:shrink-0"
      data-testid="settings-tabs"
    >
      {TABS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          data-testid={`settings-tab-${id}`}
          className={cn(
            'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-left',
            activeTab === id
              ? 'bg-[var(--cyan)]/10 text-[var(--cyan)]'
              : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
          )}
        >
          {icon}
          {label}
        </button>
      ))}

      <div className="hidden lg:block mt-auto pt-4 border-t border-[var(--border)]">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
          data-testid="logout-btn"
        >
          <LogOut className="h-4 w-4" />
          Deconnexion
        </button>
      </div>
    </nav>
  )
}
