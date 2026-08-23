'use client'

import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate, formatPrice } from '@/lib/utils'
import { COMPANY_INFO } from '@/lib/constants'
import type { Invoice } from '@/types'

export default function InvoicesPage() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    supabase.from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setInvoices(data as Invoice[])
        setLoading(false)
      })
  }, [user, supabase])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Factures</h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          {COMPANY_INFO.name} &mdash; {COMPANY_INFO.address} &mdash; SIRET {COMPANY_INFO.siret} &mdash; {COMPANY_INFO.taxNote}
        </p>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Aucune facture"
          description="Tes factures apparaitront ici apres ton premier paiement"
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">Numero</th>
                  <th className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">Date</th>
                  <th className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">Montant</th>
                  <th className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">Statut</th>
                  <th className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="px-4 py-3 text-sm font-mono text-[var(--text-primary)]">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{formatDate(inv.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{formatPrice(inv.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.status === 'paid' ? 'green' : 'default'}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[var(--cyan)] hover:underline"
                        >
                          <Download className="h-4 w-4" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
