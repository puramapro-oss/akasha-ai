import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate, formatPrice } from '@/lib/utils'
import type { Payment } from '@/lib/settings-constants'

interface BillingTabProps {
  planLabel: string
  payments: Payment[]
  loadingPayments: boolean
  onManageBilling: () => void
}

export default function BillingTab({
  planLabel,
  payments,
  loadingPayments,
  onManageBilling,
}: BillingTabProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="billing-tab">
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Plan actuel</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[var(--text-primary)] capitalize">{planLabel}</p>
            <p className="text-xs text-[var(--text-muted)]">Actif</p>
          </div>
          <Badge variant="cyan">{planLabel}</Badge>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={onManageBilling} data-testid="manage-billing-btn">
            Gerer mon abonnement
          </Button>
          <Button
            variant="ghost"
            onClick={() => (window.location.href = '/pricing')}
            data-testid="upgrade-btn"
          >
            Upgrade
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Historique des factures</h2>
        {loadingPayments ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            title="Aucune facture"
            description="Tes factures apparaitront ici apres ton premier paiement."
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {p.invoice_number ?? `#${p.id.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === 'succeeded' ? 'green' : 'default'}>
                    {p.status === 'succeeded' ? 'Paye' : p.status}
                  </Badge>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {formatPrice(p.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
