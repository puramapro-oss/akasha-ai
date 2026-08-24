import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { Aide, ProfilType, SituationType, MatchLevel } from '@/types'
import { getMatchLevel } from '@/lib/financer'

export function useFinancerData() {
  const [aides, setAides] = useState<Aide[]>([])
  const [matchedAides, setMatchedAides] = useState<(Aide & { match: MatchLevel })[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAides, setSelectedAides] = useState<Set<string>>(new Set())

  const fetchAides = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/financer/aides')
      if (!res.ok) throw new Error('Erreur chargement des aides')
      const data = (await res.json()) as { aides: Aide[] }
      setAides(data.aides)
    } catch {
      toast.error('Impossible de charger les aides. Reessaie.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAides()
  }, [fetchAides])

  const computeMatching = useCallback((
    profil: ProfilType,
    situation: SituationType,
    handicap: boolean
  ) => {
    const mapped = aides
      .filter(a => a.active)
      .map(a => ({ ...a, match: getMatchLevel(a, profil, situation, handicap) }))
      .sort((a, b) => {
        const order: Record<MatchLevel, number> = { probable: 0, possible: 1, verifier: 2 }
        if (order[a.match] !== order[b.match]) return order[a.match] - order[b.match]
        return b.montant_max - a.montant_max
      })
    setMatchedAides(mapped)
  }, [aides])

  const handleGeneratePDF = useCallback(async (
    profil: ProfilType | null,
    situation: SituationType | null,
    departement: string,
    handicap: boolean
  ): Promise<{ success: boolean; url?: string; count?: number }> => {
    if (selectedAides.size === 0) {
      toast.error('Selectionne au moins une aide pour generer le dossier.')
      return { success: false }
    }
    setLoading(true)
    try {
      const res = await fetch('/api/financer/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profil,
          situation,
          departement,
          handicap,
          aide_ids: Array.from(selectedAides),
        }),
      })
      if (!res.ok) throw new Error('Erreur generation')
      const data = (await res.json()) as { url?: string; count?: number }
      if (data.url) {
        toast.success(`Dossier genere pour ${data.count ?? selectedAides.size} aide(s)`)
        return { success: true, url: data.url, count: data.count }
      }
      return { success: false }
    } catch {
      toast.error('Impossible de generer le dossier. Reessaie.')
      return { success: false }
    } finally {
      setLoading(false)
    }
  }, [selectedAides])

  const totalCumul = matchedAides
    .filter(a => a.match === 'probable')
    .reduce((sum, a) => sum + a.montant_max, 0)

  return {
    aides,
    matchedAides,
    loading,
    selectedAides,
    setSelectedAides,
    computeMatching,
    handleGeneratePDF,
    totalCumul,
  }
}
