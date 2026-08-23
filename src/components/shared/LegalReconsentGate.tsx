'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import LegalReacceptanceGate from '@/lib/legal/components/LegalReacceptanceGate'
import { CURRENT_LEGAL_VERSIONS } from '@/lib/legal/versions'
import type { LegalDocType } from '@/lib/legal/types'
import { APP_NAME } from '@/lib/constants'

/**
 * Monte globalement `LegalReacceptanceGate` (NIYAMA-BRIEF.md §1) : bloque l'usage de l'app
 * tant qu'une preuve d'acceptation manque ou est perimee pour un des 3 docs realement
 * soumis a acceptation explicite a l'inscription (`signup/page.tsx`). Sert aussi de filet
 * de securite si l'ecriture initiale a echoue silencieusement (cf ERRORS.md) : l'utilisateur
 * est re-sollicite au prochain chargement du dashboard jusqu'a preuve enregistree en base.
 *
 * "mentions" est volontairement exclu : ce document est purement informatif, il n'a jamais
 * de mecanique de consentement explicite (aucune case a cocher/bouton "j'accepte" nulle part
 * dans l'app) — l'inclure ici bloquerait TOUS les utilisateurs indefiniment.
 */
const RECONSENT_DOC_TYPES: readonly LegalDocType[] = ['cgu', 'cgv', 'confidentialite']

function computeReconsentDocsEnAttente(derniere: Partial<Record<LegalDocType, string>>): LegalDocType[] {
  return RECONSENT_DOC_TYPES.filter((doc) => derniere[doc] !== CURRENT_LEGAL_VERSIONS[doc])
}

export default function LegalReconsentGate() {
  const { user } = useAuth()
  const [docsEnAttente, setDocsEnAttente] = useState<LegalDocType[] | null>(null)

  useEffect(() => {
    if (!user) {
      setDocsEnAttente(null)
      return
    }

    let cancelled = false
    const supabase = createClient()

    supabase
      .from('legal_acceptances')
      .select('doc_type, version, accepted_at')
      .eq('user_id', user.id)
      .order('accepted_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        const derniere: Partial<Record<LegalDocType, string>> = {}
        for (const row of (data ?? []) as { doc_type: LegalDocType; version: string }[]) {
          derniere[row.doc_type] = row.version
        }
        setDocsEnAttente(computeReconsentDocsEnAttente(derniere))
      })

    return () => {
      cancelled = true
    }
  }, [user])

  async function handleAccept(docType: LegalDocType) {
    const res = await fetch('/api/legal/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docType }),
    })
    if (!res.ok) throw new Error('legal_accept_failed')
  }

  if (!docsEnAttente || docsEnAttente.length === 0) return null

  return <LegalReacceptanceGate appName={APP_NAME} docsEnAttente={docsEnAttente} onAccept={handleAccept} />
}
