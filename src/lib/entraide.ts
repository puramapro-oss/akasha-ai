// @purama/entraide adapter pour AKASHA AI (multi-expert IA, schéma akasha_ai)
// Implémente l'interface adapter MOULE-ENTRAIDE §1 contre les tables réelles.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from 'zod'
import type {
  MutualAidProfile,
  MissionCollective,
  ContactRequestStatus,
} from '@purama/entraide'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnySupabaseClient = SupabaseClient<any, 'public', any>

function checkDatabaseError(error: unknown): void {
  if (error) throw new Error('Entraide database request failed')
}

function requireDatabaseCount(count: unknown): number {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Entraide database count unavailable')
  }
  return count
}

function databaseUserId(value: string): string {
  const id = z.string().uuid().safeParse(value)
  if (!id.success) throw new Error('Entraide database identity invalid')
  return id.data.toLowerCase()
}

// === 1. getMutualAidProfile ===
export async function getMutualAidProfile(
  supabase: AnySupabaseClient,
  userId: string
): Promise<MutualAidProfile | null> {
  const { data: profile } = await supabase
    .from('entraide_profils')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!profile) return null

  const { data: blockedUsers } = await supabase
    .from('entraide_blocages')
    .select('blocked_id')
    .eq('blocker_id', userId)

  return {
    userId: profile.user_id,
    skillsOffered: profile.skills_offered || [],
    skillsNeeded: profile.skills_needed || [],
    availabilityDays: profile.availability_days || [],
    radiusKm: profile.radius_km,
    location:
      profile.location_lat !== null && profile.location_lng !== null
        ? { lat: profile.location_lat, lng: profile.location_lng }
        : null,
    blockedUserIds: (blockedUsers || []).map((b) => b.blocked_id),
  }
}

// === 2. getBlockedUserIds ===
export async function getBlockedUserIds(
  supabase: AnySupabaseClient,
  userId: string,
  blockedUserId?: string
): Promise<string[]> {
  const blocker = databaseUserId(userId)
  const blocked = blockedUserId === undefined ? undefined : databaseUserId(blockedUserId)
  let query = supabase.from('entraide_blocages')
    .select('blocker_id,blocked_id', { count: 'exact' }).eq('blocker_id', blocker)
  if (blocked !== undefined) query = query.eq('blocked_id', blocked).limit(1)
  const { data, count, error } = await query
  checkDatabaseError(error)
  const total = requireDatabaseCount(count)
  const rows = z.array(z.object({ blocker_id: z.string().uuid(), blocked_id: z.string().uuid() })).safeParse(data)
  if (!rows.success || rows.data.length !== total || (blocked !== undefined && total > 1)) {
    throw new Error('Entraide database block result incomplete')
  }
  const ids = new Set<string>()
  for (const row of rows.data) {
    const peer = row.blocked_id.toLowerCase()
    if (row.blocker_id.toLowerCase() !== blocker || (blocked !== undefined && peer !== blocked) || ids.has(peer)) {
      throw new Error('Entraide database block identity invalid')
    }
    ids.add(peer)
  }
  return [...ids]
}

// === 3. persistMissionCollective ===
/**
 * IMPORTANT — jamais un diff "toRemove = currentIds - mission.participantIds" calculé contre
 * une lecture FRAÎCHE de la DB : mission.participantIds vient d'un snapshot pris par l'appelant
 * AVANT cet appel (potentiellement périmé sous concurrence). Si un autre join a été commité
 * entre-temps, ce diff interprète le nouveau participant (absent du snapshot périmé) comme
 * "à retirer" et le supprime réellement — lost-update reproduit sur PostgreSQL local réel
 * (cf HANDOFF-R1.md). Le retrait (leave) est géré à part par removeMissionParticipant() (DELETE
 * ciblé par clé primaire, jamais un diff contre le snapshot).
 */
export async function persistMissionCollective(
  supabase: AnySupabaseClient,
  mission: MissionCollective
): Promise<void> {
  // Statut/quorum mission (colonnes uniques, pas de liste à écraser)
  const { error: missionError } = await supabase
    .from('missions_collectives')
    .update({
      status: mission.status,
      min_participants: mission.minParticipants,
      max_participants: mission.maxParticipants,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mission.id)
  checkDatabaseError(missionError)

  // INSERT ciblé et idempotent (ON CONFLICT DO NOTHING) sur la clé primaire
  // (mission_id, user_id) déjà en place en DB — jamais de diff/DELETE ici.
  if (mission.participantIds.length > 0) {
    const { error: participantsError } = await supabase
      .from('missions_collectives_participants')
      .upsert(
        mission.participantIds.map((user_id) => ({ mission_id: mission.id, user_id })),
        { onConflict: 'mission_id,user_id', ignoreDuplicates: true }
      )
    checkDatabaseError(participantsError)
  }
}

/**
 * Retire UN participant précis (action "leave") — DELETE ciblé par clé primaire,
 * ne touche jamais les lignes des autres participants.
 */
export async function removeMissionParticipant(
  supabase: AnySupabaseClient,
  missionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('missions_collectives_participants')
    .delete()
    .eq('mission_id', missionId)
    .eq('user_id', userId)
  checkDatabaseError(error)
}

// === 4. getContactRequestsSentToday ===
export async function getContactRequestsSentToday(
  supabase: AnySupabaseClient,
  userId: string
): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  const { count, error } = await supabase
    .from('entraide_contact_requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', userId)
    .gte('created_at', `${today}T00:00:00Z`)

  checkDatabaseError(error)
  return requireDatabaseCount(count)
}

// === 5. getPendingRequestToRecipient ===
export async function getPendingRequestToRecipient(
  supabase: AnySupabaseClient,
  requesterId: string,
  recipientId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('entraide_contact_requests')
    .select('id')
    .eq('requester_id', requesterId)
    .eq('recipient_id', recipientId)
    .eq('status', 'pending')
    .maybeSingle()

  checkDatabaseError(error)
  return data !== null
}

// === 6. getLastDeclineOrExpiry ===
export async function getLastDeclineOrExpiry(
  supabase: AnySupabaseClient,
  requesterId: string,
  recipientId: string
): Promise<Date | null> {
  const { data, error } = await supabase
    .from('entraide_contact_requests')
    .select('responded_at')
    .eq('requester_id', requesterId)
    .eq('recipient_id', recipientId)
    .in('status', ['declined', 'expired'])
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  checkDatabaseError(error)
  return data?.responded_at ? new Date(data.responded_at) : null
}

// === 7. resolveContactChannel ===
// Ne s'exécute QUE si canRevealContactChannel(status) est vrai.
// Retourne un lien vers la messagerie interne (jamais email/téléphone brut).
export async function resolveContactChannel(
  supabase: SupabaseClient,
  requestId: string
): Promise<string> {
  const { data } = await supabase
    .from('entraide_contact_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()

  if (!data || data.status !== 'accepted') {
    throw new Error('Canal de contact indisponible tant que la demande n’est pas acceptée')
  }

  return `/entraide?contact_request=${encodeURIComponent(requestId)}`
}

// === 8. reportProfile ===
export async function reportProfile(
  supabase: AnySupabaseClient,
  reporterId: string,
  targetId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.from('entraide_signalements').insert({
    reporter_id: reporterId,
    target_id: targetId,
    reason,
  })
  checkDatabaseError(error)
}

// === Helpers pour les routes API ===

export async function createMissionCollectiveDB(
  supabase: AnySupabaseClient,
  organizerId: string,
  title: string,
  description: string,
  minParticipants: number,
  maxParticipants: number | null
): Promise<string> {
  const { data, error } = await supabase
    .from('missions_collectives')
    .insert({
      organizer_id: organizerId,
      title,
      description,
      min_participants: minParticipants,
      max_participants: maxParticipants,
      status: 'ouverte',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error('Failed to create mission')

  // Organizer auto-joins
  const { error: participantError } = await supabase.from('missions_collectives_participants').insert({
    mission_id: data.id,
    user_id: organizerId,
  })

  checkDatabaseError(participantError)
  return data.id
}

export async function getMissionCollectiveDB(
  supabase: AnySupabaseClient,
  missionId: string
): Promise<MissionCollective | null> {
  const { data: mission, error } = await supabase
    .from('missions_collectives')
    .select('*, missions_collectives_participants(user_id)')
    .eq('id', missionId)
    .maybeSingle()

  checkDatabaseError(error)
  if (!mission) return null

  return {
    id: mission.id,
    minParticipants: mission.min_participants,
    maxParticipants: mission.max_participants,
    participantIds: (mission.missions_collectives_participants || []).map((p: { user_id: string }) => p.user_id),
    status: mission.status as MissionCollective['status'],
  }
}

export async function insertContactRequest(
  supabase: AnySupabaseClient,
  requesterId: string,
  recipientId: string,
  message: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from('entraide_contact_requests')
    .insert({
      requester_id: requesterId,
      recipient_id: recipientId,
      message,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error('Failed to create contact request')
  return data.id
}

export async function updateContactRequestStatus(
  supabase: AnySupabaseClient,
  requestId: string,
  status: ContactRequestStatus
): Promise<void> {
  const { error } = await supabase
    .from('entraide_contact_requests')
    .update({
      status,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  checkDatabaseError(error)
}

export async function getActiveReportCount(
  supabase: AnySupabaseClient,
  targetId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('entraide_signalements')
    .select('*', { count: 'exact', head: true })
    .eq('target_id', targetId)

  checkDatabaseError(error)
  return requireDatabaseCount(count)
}
