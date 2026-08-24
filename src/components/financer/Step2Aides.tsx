'use client'

import { ArrowLeft, MapPin, FileText, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import type { Aide, MatchLevel } from '@/types'
import { MATCH_BADGES } from '@/constants/financer'

interface Step2AidesProps {
  matchedAides: (Aide & { match: MatchLevel })[]
  selectedAides: Set<string>
  setSelectedAides: (s: Set<string>) => void
  totalCumul: number
  loading: boolean
  onBack: () => void
  onNext: () => void
}

export default function Step2Aides({
  matchedAides,
  selectedAides,
  setSelectedAides,
  totalCumul,
  loading,
  onBack,
  onNext,
}: Step2AidesProps) {
  return (
    <div className="space-y-6">
      {/* Cumul banner */}
      {totalCumul > 0 && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
          <p className="text-sm text-emerald-400 mb-1">Montant cumulable estime</p>
          <p className="text-4xl font-bold text-emerald-400">
            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalCumul)}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Ton abonnement AKASHA peut ne rien te couter
          </p>
        </div>
      )}

      {/* Aides list */}
      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-[var(--text-muted)]">Chargement des aides...</div>
        )}
        {!loading && matchedAides.length === 0 && (
          <div className="text-center py-12 text-[var(--text-muted)]">Aucune aide trouvee. Essaie de modifier ton profil.</div>
        )}
        {matchedAides.map(aide => {
          const badge = MATCH_BADGES[aide.match]
          const isSelected = selectedAides.has(aide.id)
          return (
            <Card
              key={aide.id}
              data-testid={`aide-${aide.id}`}
              className={`p-5 cursor-pointer transition-all duration-200 ${
                isSelected ? 'ring-1 ring-[var(--cyan)]/40 bg-[var(--cyan)]/5' : ''
              }`}
              onClick={() => {
                const next = new Set(selectedAides)
                if (next.has(aide.id)) next.delete(aide.id)
                else next.add(aide.id)
                setSelectedAides(next)
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-[var(--text-primary)] text-sm">{aide.nom}</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>
                      {badge.icon} {badge.label}
                    </span>
                    {aide.handicap_only && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400 border border-purple-400/20">
                        RQTH
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] line-clamp-2">{aide.description}</p>
                  {aide.region !== 'national' && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {aide.region}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-[var(--text-primary)]">
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(aide.montant_max)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {aide.taux_remboursement}% pris en charge
                  </p>
                </div>
              </div>
              {aide.url_officielle && (
                <a
                  href={aide.url_officielle}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 mt-2 text-xs text-[var(--cyan)] hover:underline"
                >
                  Site officiel <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </Card>
          )
        })}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack} data-testid="btn-step2-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedAides.size === 0}
          data-testid="btn-step2-next"
        >
          Generer mon dossier ({selectedAides.size}) <FileText className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
