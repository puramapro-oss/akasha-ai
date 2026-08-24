'use client'

import { CheckCircle2 } from 'lucide-react'

interface ProgressBarProps {
  currentStep: number
}

export default function ProgressBar({ currentStep }: ProgressBarProps) {
  return (
    <>
      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              s <= currentStep
                ? 'bg-[var(--cyan)] text-black'
                : 'bg-white/5 text-[var(--text-muted)] border border-[var(--border)]'
            }`}>
              {s < currentStep ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 4 && <div className={`w-8 h-0.5 ${s < currentStep ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'}`} />}
          </div>
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-center gap-6 mb-10 text-xs text-[var(--text-muted)]">
        <span className={currentStep === 1 ? 'text-[var(--cyan)]' : ''}>Profil</span>
        <span className={currentStep === 2 ? 'text-[var(--cyan)]' : ''}>Aides</span>
        <span className={currentStep === 3 ? 'text-[var(--cyan)]' : ''}>Dossier</span>
        <span className={currentStep === 4 ? 'text-[var(--cyan)]' : ''}>Suivi</span>
      </div>
    </>
  )
}
