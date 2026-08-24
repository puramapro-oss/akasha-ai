import type { Aide, ProfilType, SituationType, MatchLevel } from '@/types'

export function getMatchLevel(
  aide: Aide,
  profil: ProfilType,
  situation: SituationType,
  handicap: boolean
): MatchLevel {
  const profilMatch = aide.profil_eligible.includes(profil) || aide.profil_eligible.includes('particulier')
  const situationMatch = aide.situation_eligible.includes(situation)
  const handicapMatch = !aide.handicap_only || handicap

  if (profilMatch && situationMatch && handicapMatch) return 'probable'
  if ((profilMatch || situationMatch) && handicapMatch) return 'possible'
  return 'verifier'
}
