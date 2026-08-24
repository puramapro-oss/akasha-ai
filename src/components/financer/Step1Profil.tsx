'use client'

import { ArrowRight, MapPin, Accessibility, ChevronDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { ProfilType, SituationType } from '@/types'
import { PROFIL_OPTIONS, SITUATION_OPTIONS, DEPARTEMENTS } from '@/constants/financer'

interface Step1ProfilProps {
  profil: ProfilType | null
  setProfil: (p: ProfilType) => void
  situation: SituationType | null
  setSituation: (s: SituationType) => void
  departement: string
  setDepartement: (d: string) => void
  handicap: boolean
  setHandicap: (h: boolean) => void
  onNext: () => void
}

export default function Step1Profil({
  profil,
  setProfil,
  situation,
  setSituation,
  departement,
  setDepartement,
  handicap,
  setHandicap,
  onNext,
}: Step1ProfilProps) {
  return (
    <div className="space-y-8">
      {/* Profil type */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quel est ton profil ?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROFIL_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setProfil(opt.id)}
              data-testid={`profil-${opt.id}`}
              className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-200 ${
                profil === opt.id
                  ? 'border-[var(--cyan)] bg-[var(--cyan)]/5 shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                  : 'border-[var(--border)] bg-white/[0.03] hover:bg-white/[0.05]'
              }`}
            >
              <div className={`flex-shrink-0 ${profil === opt.id ? 'text-[var(--cyan)]' : 'text-[var(--text-secondary)]'}`}>
                {opt.icon}
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)]">{opt.label}</p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Situation */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quelle est ta situation ?</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SITUATION_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSituation(opt.id)}
              data-testid={`situation-${opt.id}`}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                situation === opt.id
                  ? 'border-[var(--cyan)] bg-[var(--cyan)]/5 text-[var(--cyan)]'
                  : 'border-[var(--border)] bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.05]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Departement */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Departement <span className="text-sm font-normal text-[var(--text-muted)]">(optionnel)</span>
        </h2>
        <div className="relative">
          <select
            value={departement}
            onChange={e => setDepartement(e.target.value)}
            data-testid="departement-select"
            className="w-full appearance-none rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] transition-colors"
          >
            <option value="">Tous les departements</option>
            {DEPARTEMENTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Handicap */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer" data-testid="handicap-toggle">
          <div
            onClick={() => setHandicap(!handicap)}
            className={`relative w-11 h-6 rounded-full transition-colors ${handicap ? 'bg-[var(--cyan)]' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${handicap ? 'translate-x-5' : ''}`} />
          </div>
          <div className="flex items-center gap-2">
            <Accessibility className="w-5 h-5 text-[var(--text-secondary)]" />
            <span className="text-sm text-[var(--text-primary)]">Situation de handicap (RQTH)</span>
          </div>
        </label>
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!profil || !situation}
          className="px-8"
          data-testid="btn-step1-next"
        >
          Voir mes aides <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
