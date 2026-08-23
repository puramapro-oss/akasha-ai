'use client'

import { Star } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { XP_ACTIONS } from '@/lib/constants'
import { getXPActionIcon, XP_ACTION_LABELS } from '@/constants/xp'

export default function XPActions() {
  return (
    <section data-testid="xp-actions-section">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Comment gagner des XP
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(XP_ACTIONS).map(([key, value]) => (
          <Card key={key} className="flex items-center gap-3 p-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--cyan)]/10 text-[var(--cyan)]">
              {getXPActionIcon(key) ?? <Star className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {XP_ACTION_LABELS[key] ?? key}
              </p>
            </div>
            <Badge variant="gold">+{value} XP</Badge>
          </Card>
        ))}
      </div>
    </section>
  )
}
