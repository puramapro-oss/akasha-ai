'use client'

import Link from 'next/link'
import { ArrowLeft, FileText, Download, Shield } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import type { ProfilType, SituationType } from '@/types'
import { PROFIL_OPTIONS, SITUATION_OPTIONS } from '@/constants/financer'

interface Step3DossierProps {
  profil: ProfilType | null
  situation: SituationType | null
  departement: string
  handicap: boolean
  selectedAidesCount: number
  loading: boolean
  isAuthenticated: boolean
  onBack: () => void
  onGenerate: () => void
}

export default function Step3Dossier({
  profil,
  situation,
  departement,
  handicap,
  selectedAidesCount,
  loading,
  isAuthenticated,
  onBack,
  onGenerate,
}: Step3DossierProps) {
  return (
    <div className="space-y-6">
      <Card className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cyan)]/10 flex items-center justify-center mx-auto mb-6">
          <FileText className="w-8 h-8 text-[var(--cyan)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Generer ton dossier
        </h2>
        <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
          AKASHA va generer un dossier PDF personnalise pour chaque aide selectionnee,
          avec tes informations et les justificatifs necessaires.
        </p>

        <div className="bg-white/[0.03] rounded-xl border border-[var(--border)] p-4 mb-6 text-left">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Resume</h3>
          <div className="space-y-2 text-sm text-[var(--text-secondary)]">
            <p><span className="text-[var(--text-muted)]">Profil :</span> {PROFIL_OPTIONS.find(p => p.id === profil)?.label}</p>
            <p><span className="text-[var(--text-muted)]">Situation :</span> {SITUATION_OPTIONS.find(s => s.id === situation)?.label}</p>
            {departement && <p><span className="text-[var(--text-muted)]">Departement :</span> {departement}</p>}
            {handicap && <p><span className="text-[var(--text-muted)]">Handicap :</span> Oui (RQTH)</p>}
            <p><span className="text-[var(--text-muted)]">Aides selectionnees :</span> {selectedAidesCount}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="secondary" onClick={onBack} data-testid="btn-step3-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Modifier
          </Button>
          <Button
            onClick={onGenerate}
            loading={loading}
            data-testid="btn-generate-pdf"
          >
            <Download className="w-4 h-4 mr-2" /> Generer le PDF
          </Button>
        </div>
      </Card>

      {!isAuthenticated && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
          <p className="text-sm text-amber-400">
            <Shield className="w-4 h-4 inline mr-1" />
            Connecte-toi pour sauvegarder ton dossier et suivre tes demandes.
          </p>
          <Link href="/signup" className="text-sm text-[var(--cyan)] hover:underline mt-1 inline-block">
            Creer un compte gratuit
          </Link>
        </div>
      )}
    </div>
  )
}
