'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Euro } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFinancerData } from '@/hooks/useFinancerData'
import type { ProfilType, SituationType } from '@/types'
import ProgressBar from '@/components/financer/ProgressBar'
import Step1Profil from '@/components/financer/Step1Profil'
import Step2Aides from '@/components/financer/Step2Aides'
import Step3Dossier from '@/components/financer/Step3Dossier'
import Step4Suivi from '@/components/financer/Step4Suivi'

export default function FinancerPage() {
  const { isAuthenticated } = useAuth()
  const [step, setStep] = useState(1)
  const [profil, setProfil] = useState<ProfilType | null>(null)
  const [situation, setSituation] = useState<SituationType | null>(null)
  const [departement, setDepartement] = useState('')
  const [handicap, setHandicap] = useState(false)

  const {
    matchedAides,
    loading,
    selectedAides,
    setSelectedAides,
    computeMatching,
    handleGeneratePDF,
    totalCumul,
  } = useFinancerData()

  const goNext = () => {
    if (step === 1 && profil && situation) {
      computeMatching(profil, situation, handicap)
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    }
  }

  const handleGenerate = async () => {
    const result = await handleGeneratePDF(profil, situation, departement, handicap)
    if (result.success && result.url) {
      window.open(result.url, '_blank')
      setStep(4)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <Link href={isAuthenticated ? '/dashboard' : '/pricing'} className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm mb-8">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-4 py-1.5 text-emerald-400 text-sm font-medium mb-4">
            <Euro className="w-3.5 h-3.5" />
            Financement 100% rembourse
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-3">
            Ton abonnement rembourse
          </h1>
          <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
            45 aides francaises disponibles. La plupart de nos clients ne paient rien.
          </p>
        </div>

        <ProgressBar currentStep={step} />

        {step === 1 && (
          <Step1Profil
            profil={profil}
            setProfil={setProfil}
            situation={situation}
            setSituation={setSituation}
            departement={departement}
            setDepartement={setDepartement}
            handicap={handicap}
            setHandicap={setHandicap}
            onNext={goNext}
          />
        )}

        {step === 2 && (
          <Step2Aides
            matchedAides={matchedAides}
            selectedAides={selectedAides}
            setSelectedAides={setSelectedAides}
            totalCumul={totalCumul}
            loading={loading}
            onBack={() => setStep(1)}
            onNext={goNext}
          />
        )}

        {step === 3 && (
          <Step3Dossier
            profil={profil}
            situation={situation}
            departement={departement}
            handicap={handicap}
            selectedAidesCount={selectedAides.size}
            loading={loading}
            isAuthenticated={isAuthenticated}
            onBack={() => setStep(2)}
            onGenerate={() => void handleGenerate()}
          />
        )}

        {step === 4 && (
          <Step4Suivi
            matchedAides={matchedAides}
            selectedAides={selectedAides}
            isAuthenticated={isAuthenticated}
            onNewSearch={() => { setStep(1); setSelectedAides(new Set()) }}
          />
        )}
      </div>
    </div>
  )
}
