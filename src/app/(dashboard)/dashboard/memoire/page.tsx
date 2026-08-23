'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Skeleton from '@/components/ui/Skeleton'
import MaMemoirePage, { type LegalAcceptanceRow } from '@/lib/legal/components/MaMemoirePage'

export default function MemoirePage() {
  const { user } = useAuth()
  const [acceptations, setAcceptations] = useState<LegalAcceptanceRow[]>([])
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    Promise.all([
      supabase
        .from('legal_acceptances')
        .select('doc_type, version, accepted_at')
        .eq('user_id', user.id),
      supabase
        .from('account_deletion_requests')
        .select('scheduled_for, status')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .maybeSingle(),
    ]).then(([{ data: rows }, { data: deletion }]) => {
      setAcceptations(
        ((rows ?? []) as Array<{ doc_type: string; version: string; accepted_at: string }>).map((r) => ({
          docType: r.doc_type,
          version: r.version,
          acceptedAt: r.accepted_at,
        }))
      )
      setDeletionScheduledFor((deletion as { scheduled_for: string } | null)?.scheduled_for ?? null)
      setLoading(false)
    })
  }, [user])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <MaMemoirePage appName="AKASHA AI" acceptations={acceptations} deletionScheduledFor={deletionScheduledFor} />
  )
}
