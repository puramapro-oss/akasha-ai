'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles, Clock, CheckCircle2, XCircle, RefreshCw, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import type { Aide, MatchLevel } from '@/types'

interface Step4SuiviProps {
  matchedAides: (Aide & { match: MatchLevel })[]
  selectedAides: Set<string>
  isAuthenticated: boolean
  onNewSearch: () => void
}

export default function Step4Suivi({
  matchedAides,
  selectedAides,
  isAuthenticated,
  onNewSearch,
}: Step4SuiviProps) {
  return (
    <div className="space-y-6">
      <Card className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Dossier genere avec succes
        </h2>
        <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
          Tes dossiers de financement sont prets. Depose-les aupres des organismes concernes.
        </p>
      </Card>

      {/* Status cards */}
      <div className="space-y-3">
        {matchedAides
          .filter(a => selectedAides.has(a.id))
          .map(aide => (
            <Card key={aide.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm text-[var(--text-primary)]">{aide.nom}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(aide.montant_max)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">En cours</span>
              </div>
            </Card>
          ))}
      </div>

      {/* Statut legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" /> En cours</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Accepte</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> Refuse</span>
        <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 text-sky-400" /> A renouveler</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button variant="secondary" onClick={onNewSearch} data-testid="btn-new-search">
          <Search className="w-4 h-4 mr-2" /> Nouvelle recherche
        </Button>
        {isAuthenticated && (
          <Link href="/dashboard">
            <Button data-testid="btn-go-dashboard">
              Retour au dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
