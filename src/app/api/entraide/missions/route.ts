import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEntraideActor, entraideJson, entraideErrorResponse, EntraideError } from '@/lib/entraide-server'
import { z } from 'zod'
import {
  createMissionCollective,
  joinMission,
  leaveMission,
  startMission,
  completeMission,
  cancelMission,
  MIN_PARTICIPANTS_COLLECTIVE,
} from '@purama/entraide'
import {
  createMissionCollectiveDB,
  getMissionCollectiveDB,
  persistMissionCollective,
  removeMissionParticipant,
} from '@/lib/entraide'

const CreateMissionSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000),
  min_participants: z.number().int().min(MIN_PARTICIPANTS_COLLECTIVE).max(100),
  max_participants: z.number().int().min(MIN_PARTICIPANTS_COLLECTIVE).max(100).nullable(),
})

const MissionActionSchema = z.object({
  mission_id: z.string().uuid(),
  action: z.enum(['join', 'leave', 'start', 'complete', 'cancel']),
})

export async function POST(req: NextRequest) {
  try {
    const user = { id: await requireEntraideActor(req) }

    const body = await req.json()

    // Create new mission
    if (body && typeof body === 'object' && 'title' in body) {
      const validated = CreateMissionSchema.parse(body)
      const serviceSupabase = createServiceClient()

      // Use lib pure function
      const result = createMissionCollective({
        id: crypto.randomUUID(),
        organizerId: user.id,
        minParticipants: validated.min_participants,
        maxParticipants: validated.max_participants,
      })

      if (!result.ok) {
        return entraideJson({ error: result.reason }, 400)
      }

      // Persist to DB
      const missionId = await createMissionCollectiveDB(
        serviceSupabase,
        user.id,
        validated.title,
        validated.description,
        validated.min_participants,
        validated.max_participants
      )

      return entraideJson({ mission_id: missionId })
    }

    // Mission action (join/leave/start/complete/cancel)
    const validated = MissionActionSchema.parse(body)
    const serviceSupabase = createServiceClient()

    const mission = await getMissionCollectiveDB(serviceSupabase, validated.mission_id)
    if (!mission) {
      return entraideJson({ error: 'Mission introuvable' }, 404)
    }

    // start/complete/cancel changent l'état de la mission pour TOUS les participants —
    // réservés à l'organisateur (join/leave restent ouverts à tout participant, pas de check ici).
    if (['start', 'complete', 'cancel'].includes(validated.action)) {
      const { data: missionRow, error: missionError } = await serviceSupabase
        .from('missions_collectives')
        .select('organizer_id')
        .eq('id', validated.mission_id)
        .single()
      if (missionError) throw new EntraideError(503, 'Résolution indisponible')
      if (!missionRow || missionRow.organizer_id !== user.id) {
        return entraideJson({ error: "Seul l'organisateur peut effectuer cette action" }, 403)
      }
    }

    let result
    switch (validated.action) {
      case 'join':
        result = joinMission(mission, user.id)
        break
      case 'leave':
        result = leaveMission(mission, user.id)
        break
      case 'start':
        result = startMission(mission)
        break
      case 'complete':
        result = completeMission(mission)
        break
      case 'cancel':
        result = cancelMission(mission)
        break
    }

    if (!result.ok) {
      return entraideJson({ error: result.reason }, 400)
    }

    // persistMissionCollective() est désormais insert-only (upsert idempotent) — le retrait
    // effectif de CE participant précis doit être fait explicitement, jamais via un diff.
    await persistMissionCollective(serviceSupabase, result.mission)
    if (validated.action === 'leave') {
      await removeMissionParticipant(serviceSupabase, validated.mission_id, user.id)
    }

    return entraideJson({ mission: {
      id: result.mission.id, minParticipants: result.mission.minParticipants,
      maxParticipants: result.mission.maxParticipants, participantIds: result.mission.participantIds,
      status: result.mission.status,
    } })
  } catch (error) {
    return entraideErrorResponse(error)
  }
}
