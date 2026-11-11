import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await req.json()

    // Create new mission
    if ('title' in body) {
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
        return NextResponse.json({ error: result.reason }, { status: 400 })
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

      return NextResponse.json({ mission_id: missionId })
    }

    // Mission action (join/leave/start/complete/cancel)
    const validated = MissionActionSchema.parse(body)
    const serviceSupabase = createServiceClient()

    const mission = await getMissionCollectiveDB(serviceSupabase, validated.mission_id)
    if (!mission) {
      return NextResponse.json({ error: 'Mission introuvable' }, { status: 404 })
    }

    // start/complete/cancel changent l'état de la mission pour TOUS les participants —
    // réservés à l'organisateur (join/leave restent ouverts à tout participant, pas de check ici).
    if (['start', 'complete', 'cancel'].includes(validated.action)) {
      const { data: missionRow } = await serviceSupabase
        .from('missions_collectives')
        .select('organizer_id')
        .eq('id', validated.mission_id)
        .single()
      if (!missionRow || missionRow.organizer_id !== user.id) {
        return NextResponse.json({ error: "Seul l'organisateur peut effectuer cette action" }, { status: 403 })
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
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    // persistMissionCollective() est désormais insert-only (upsert idempotent) — le retrait
    // effectif de CE participant précis doit être fait explicitement, jamais via un diff.
    await persistMissionCollective(serviceSupabase, result.mission)
    if (validated.action === 'leave') {
      await removeMissionParticipant(serviceSupabase, validated.mission_id, user.id)
    }

    return NextResponse.json({ mission: result.mission })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 })
    }
    console.error('[entraide/missions POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
