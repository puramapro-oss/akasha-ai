'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, User, Building2, Heart, GraduationCap,
  Search, MapPin, Accessibility, FileText, Download,
  CheckCircle2, Clock, XCircle, RefreshCw, Euro, Sparkles, Shield,
  ChevronDown, ExternalLink,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import type { Aide, ProfilType, SituationType } from '@/types'

const PROFIL_OPTIONS: { id: ProfilType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'particulier', label: 'Particulier', icon: <User className="w-6 h-6" />, desc: 'Salarie, demandeur d\'emploi, independant...' },
  { id: 'entreprise', label: 'Entreprise', icon: <Building2 className="w-6 h-6" />, desc: 'TPE, PME, startup, auto-entrepreneur' },
  { id: 'association', label: 'Association', icon: <Heart className="w-6 h-6" />, desc: 'Association loi 1901, ONG, fondation' },
  { id: 'etudiant', label: 'Etudiant', icon: <GraduationCap className="w-6 h-6" />, desc: 'Lyceen, etudiant, alternant' },
]

const SITUATION_OPTIONS: { id: SituationType; label: string }[] = [
  { id: 'salarie', label: 'Salarie(e)' },
  { id: 'demandeur_emploi', label: 'Demandeur d\'emploi' },
  { id: 'independant', label: 'Independant / Freelance' },
  { id: 'auto_entrepreneur', label: 'Auto-entrepreneur' },
  { id: 'retraite', label: 'Retraite(e)' },
  { id: 'rsa', label: 'Beneficiaire RSA' },
  { id: 'cej', label: 'Contrat Engagement Jeune' },
  { id: 'etudiant', label: 'Etudiant(e)' },
]

const DEPARTEMENTS = [
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19',
  '2A','2B','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37',
  '38','39','40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56',
  '57','58','59','60','61','62','63','64','65','66','67','68','69','70','71','72','73','74','75',
  '76','77','78','79','80','81','82','83','84','85','86','87','88','89','90','91','92','93','94',
  '95','971','972','973','974','976',
]

type MatchLevel = 'probable' | 'possible' | 'verifier'

function getMatchLevel(aide: Aide, profil: ProfilType, situation: SituationType, handicap: boolean): MatchLevel {
  const profilMatch = aide.profil_eligible.includes(profil) || aide.profil_eligible.includes('particulier')
  const situationMatch = aide.situation_eligible.includes(situation)
  const handicapMatch = !aide.handicap_only || handicap

  if (profilMatch && situationMatch && handicapMatch) return 'probable'
  if ((profilMatch || situationMatch) && handicapMatch) return 'possible'
  return 'verifier'
}

const MATCH_BADGES: Record<MatchLevel, { label: string; color: string; icon: string }> = {
  probable: { label: 'Probable', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: '✅' },
  possible: { label: 'Possible', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20', icon: '🟡' },
  verifier: { label: 'A verifier', color: 'text-sky-400 bg-sky-400/10 border-sky-400/20', icon: '🔵' },
}

export default function FinancerPage() {
  const { isAuthenticated } = useAuth()
  const [step, setStep] = useState(1)
  const [profil, setProfil] = useState<ProfilType | null>(null)
  const [situation, setSituation] = useState<SituationType | null>(null)
  const [departement, setDepartement] = useState('')
  const [handicap, setHandicap] = useState(false)
  const [aides, setAides] = useState<Aide[]>([])
  const [matchedAides, setMatchedAides] = useState<(Aide & { match: MatchLevel })[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAides, setSelectedAides] = useState<Set<string>>(new Set())

  // Fetch aides
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

  // Match aides when going to step 2
  const computeMatching = useCallback(() => {
    if (!profil || !situation) return
    const mapped = aides
      .filter(a => a.active)
      .map(a => ({ ...a, match: getMatchLevel(a, profil, situation, handicap) }))
      .sort((a, b) => {
        const order: Record<MatchLevel, number> = { probable: 0, possible: 1, verifier: 2 }
        if (order[a.match] !== order[b.match]) return order[a.match] - order[b.match]
        return b.montant_max - a.montant_max
      })
    setMatchedAides(mapped)
  }, [aides, profil, situation, handicap])

  const totalCumul = matchedAides
    .filter(a => a.match === 'probable')
    .reduce((sum, a) => sum + a.montant_max, 0)

  const handleGeneratePDF = async () => {
    if (selectedAides.size === 0) {
      toast.error('Selectionne au moins une aide pour generer le dossier.')
      return
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
        window.open(data.url, '_blank')
        toast.success(`Dossier genere pour ${data.count ?? selectedAides.size} aide(s)`)
        setStep(4)
      }
    } catch {
      toast.error('Impossible de generer le dossier. Reessaie.')
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    if (step === 1 && profil && situation) {
      computeMatching()
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
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

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s <= step
                  ? 'bg-[var(--cyan)] text-black'
                  : 'bg-white/5 text-[var(--text-muted)] border border-[var(--border)]'
              }`}>
                {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-8 h-0.5 ${s < step ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'}`} />}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex justify-center gap-6 mb-10 text-xs text-[var(--text-muted)]">
          <span className={step === 1 ? 'text-[var(--cyan)]' : ''}>Profil</span>
          <span className={step === 2 ? 'text-[var(--cyan)]' : ''}>Aides</span>
          <span className={step === 3 ? 'text-[var(--cyan)]' : ''}>Dossier</span>
          <span className={step === 4 ? 'text-[var(--cyan)]' : ''}>Suivi</span>
        </div>

        {/* STEP 1 — Profil */}
        {step === 1 && (
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
                onClick={goNext}
                disabled={!profil || !situation}
                className="px-8"
                data-testid="btn-step1-next"
              >
                Voir mes aides <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — Aides matchees */}
        {step === 2 && (
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
              <Button variant="secondary" onClick={() => setStep(1)} data-testid="btn-step2-back">
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour
              </Button>
              <Button
                onClick={goNext}
                disabled={selectedAides.size === 0}
                data-testid="btn-step2-next"
              >
                Generer mon dossier ({selectedAides.size}) <FileText className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 — Generation dossier */}
        {step === 3 && (
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
                  <p><span className="text-[var(--text-muted)]">Aides selectionnees :</span> {selectedAides.size}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button variant="secondary" onClick={() => setStep(2)} data-testid="btn-step3-back">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Modifier
                </Button>
                <Button
                  onClick={() => void handleGeneratePDF()}
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
        )}

        {/* STEP 4 — Suivi */}
        {step === 4 && (
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
              <Button variant="secondary" onClick={() => { setStep(1); setSelectedAides(new Set()) }} data-testid="btn-new-search">
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
        )}
      </div>
    </div>
  )
}
