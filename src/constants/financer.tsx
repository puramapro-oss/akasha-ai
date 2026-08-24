import { User, Building2, Heart, GraduationCap } from 'lucide-react'
import type { ProfilType, SituationType, MatchLevel } from '@/types'

export const PROFIL_OPTIONS: { id: ProfilType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'particulier', label: 'Particulier', icon: <User className="w-6 h-6" />, desc: 'Salarie, demandeur d\'emploi, independant...' },
  { id: 'entreprise', label: 'Entreprise', icon: <Building2 className="w-6 h-6" />, desc: 'TPE, PME, startup, auto-entrepreneur' },
  { id: 'association', label: 'Association', icon: <Heart className="w-6 h-6" />, desc: 'Association loi 1901, ONG, fondation' },
  { id: 'etudiant', label: 'Etudiant', icon: <GraduationCap className="w-6 h-6" />, desc: 'Lyceen, etudiant, alternant' },
]

export const SITUATION_OPTIONS: { id: SituationType; label: string }[] = [
  { id: 'salarie', label: 'Salarie(e)' },
  { id: 'demandeur_emploi', label: 'Demandeur d\'emploi' },
  { id: 'independant', label: 'Independant / Freelance' },
  { id: 'auto_entrepreneur', label: 'Auto-entrepreneur' },
  { id: 'retraite', label: 'Retraite(e)' },
  { id: 'rsa', label: 'Beneficiaire RSA' },
  { id: 'cej', label: 'Contrat Engagement Jeune' },
  { id: 'etudiant', label: 'Etudiant(e)' },
]

export const DEPARTEMENTS = [
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19',
  '2A','2B','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37',
  '38','39','40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56',
  '57','58','59','60','61','62','63','64','65','66','67','68','69','70','71','72','73','74','75',
  '76','77','78','79','80','81','82','83','84','85','86','87','88','89','90','91','92','93','94',
  '95','971','972','973','974','976',
]

export const MATCH_BADGES: Record<MatchLevel, { label: string; color: string; icon: string }> = {
  probable: { label: 'Probable', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: '✅' },
  possible: { label: 'Possible', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20', icon: '🟡' },
  verifier: { label: 'A verifier', color: 'text-sky-400 bg-sky-400/10 border-sky-400/20', icon: '🔵' },
}
