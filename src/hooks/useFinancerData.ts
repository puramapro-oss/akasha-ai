import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { Aide, ProfilType, SituationType, MatchLevel } from '@/types'
import { getMatchLevel } from '@/lib/financer'
import { useAsyncResource, ASYNC_RESOURCE_TIMEOUT_MS } from './useAsyncResource'

export function useFinancerData() {
  const [criteria, setCriteria] = useState<{ profil: ProfilType; situation: SituationType; handicap: boolean } | null>(null)
  const [selectedAides, setSelectedAides] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const generation = useRef<{ active: boolean; job: number; cancel: () => void }>({ active: false, job: 0, cancel: () => undefined })
  useEffect(() => {
    const control = generation.current
    control.active = true
    return () => { control.active = false; control.job += 1; control.cancel() }
  }, [])
  const load = useCallback(async (signal: AbortSignal): Promise<Aide[]> => {
    const response = await fetch('/api/financer/aides', { signal })
    if (!response.ok) throw new Error('Impossible de charger les aides. Reessaie.')
    return ((await response.json()) as { aides: Aide[] }).aides
  }, [])
  const resource = useAsyncResource('public-aides', load, [] as Aide[])
  const { data: aides, error, isCurrent } = resource
  useEffect(() => { if (error) toast.error(error.message) }, [error])
  const matchedAides = useMemo(() => criteria ? aides.filter(aide => aide.active)
    .map(aide => ({ ...aide, match: getMatchLevel(aide, criteria.profil, criteria.situation, criteria.handicap) }))
    .sort((a, b) => {
      const order: Record<MatchLevel, number> = { probable: 0, possible: 1, verifier: 2 }
      return order[a.match] - order[b.match] || b.montant_max - a.montant_max
    }) : [], [aides, criteria])
  const computeMatching = useCallback((profil: ProfilType, situation: SituationType, handicap: boolean) => {
    setCriteria({ profil, situation, handicap })
  }, [])

  const handleGeneratePDF = useCallback(async (
    profil: ProfilType | null, situation: SituationType | null, departement: string, handicap: boolean,
  ): Promise<{ success: boolean; url?: string; count?: number }> => {
    if (!selectedAides.size) {
      toast.error('Selectionne au moins une aide pour generer le dossier.')
      return { success: false }
    }
    const control = generation.current
    if (!control.active || !isCurrent()) return { success: false }
    control.cancel()
    const job = ++control.job
    const controller = new AbortController()
    let rejectDeadline!: (reason: Error) => void
    const cancelled = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
    const deadline = setTimeout(() => {
      controller.abort()
      rejectDeadline(new Error('Confirmation indisponible. Actualise pour vérifier le dossier avant de réessayer.'))
    }, ASYNC_RESOURCE_TIMEOUT_MS)
    control.cancel = () => { controller.abort(); clearTimeout(deadline); rejectDeadline(new Error('Cancelled')) }
    setGenerating(true)
    try {
      const request = async () => {
        const response = await fetch('/api/financer/dossier', {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profil, situation, departement, handicap, aide_ids: Array.from(selectedAides) }),
        })
        if (!response.ok) throw new Error('Impossible de generer le dossier. Reessaie.')
        return await response.json() as { url?: string; count?: number }
      }
      const data = await Promise.race([request(), cancelled])
      if (!control.active || job !== control.job || !isCurrent()) return { success: false }
      if (!data.url) { toast.error('Le dossier ne contient pas de lien disponible.'); return { success: false } }
      toast.success('Dossier genere pour ' + (data.count ?? selectedAides.size) + ' aide(s)')
      return { success: true, url: data.url, count: data.count }
    } catch (error) {
      if (control.active && job === control.job && isCurrent()) toast.error(error instanceof Error ? error.message : 'Impossible de generer le dossier. Reessaie.')
      return { success: false }
    } finally {
      clearTimeout(deadline)
      if (control.active && job === control.job && isCurrent()) setGenerating(false)
    }
  }, [selectedAides, isCurrent])
  const totalCumul = matchedAides.filter(aide => aide.match === 'probable').reduce((sum, aide) => sum + aide.montant_max, 0)
  return { aides, matchedAides, loading: resource.loading || generating, error, selectedAides, setSelectedAides, computeMatching, handleGeneratePDF, totalCumul }
}
