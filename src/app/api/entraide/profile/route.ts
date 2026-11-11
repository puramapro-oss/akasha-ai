import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { UpdateProfileSchema } from '@/lib/entraide-contracts'
import {
  requireEntraideActor, getOwnEntraideProfile, ownProfileProjection,
  OWN_PROFILE_COLUMNS, EntraideError, entraideJson, entraideErrorResponse,
} from '@/lib/entraide-server'

export async function GET(request: NextRequest) {
  try {
    const actor = await requireEntraideActor(request)
    const profile = await getOwnEntraideProfile(actor, createServiceClient())
    return entraideJson({ profile })
  } catch (error) {
    return entraideErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireEntraideActor(request)
    const validated = UpdateProfileSchema.parse(await request.json())
    // Column SELECT grants exclude coordinates even for owners. Privileged access is
    // bounded to the actor verified above; neither body.user_id nor ambient cookies decide it.
    const { data, error } = await createServiceClient().from('entraide_profils')
      .upsert({ ...validated, user_id: actor, updated_at: new Date().toISOString() })
      .select(OWN_PROFILE_COLUMNS).single()
    if (error) throw new EntraideError(503, 'Profil Entraide indisponible')
    return entraideJson({ profile: ownProfileProjection(data, actor) })
  } catch (error) {
    return entraideErrorResponse(error)
  }
}
