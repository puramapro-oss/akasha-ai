'use client'

import { ArrowUpRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import type { CommissionRow } from '@/types/ambassador'

interface AmbassadorCommissionsProps {
  commissions: CommissionRow[]
}

export default function AmbassadorCommissions({ commissions }: AmbassadorCommissionsProps) {
  const totalCommissions = commissions.reduce((acc, c) => acc + c.amount, 0)
  const pendingCommissions = commissions
    .filter(c => c.status === 'pending')
    .reduce((acc, c) => acc + c.amount, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-[var(--text-muted)]">Total commissions</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {totalCommissions.toFixed(2)} €
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-muted)]">En attente</p>
          <p className="text-2xl font-bold text-yellow-400">
            {pendingCommissions.toFixed(2)} €
          </p>
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h3 className="font-semibold text-[var(--text-primary)]">Historique</h3>
        </div>
        {commissions.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-muted)]">
            Aucune commission pour le moment
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {commissions.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                <ArrowUpRight className="h-4 w-4 text-green-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    Commission {c.type}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(c.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400">+{c.amount.toFixed(2)} €</p>
                  <Badge
                    variant={c.status === 'paid' ? 'green' : 'default'}
                    className="text-[10px]"
                  >
                    {c.status === 'paid' ? 'Payé' : 'En attente'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
