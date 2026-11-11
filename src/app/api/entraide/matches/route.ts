import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  requireEntraideActor, getEntraideMatches, entraideJson, entraideErrorResponse,
} from '@/lib/entraide-server'

export async function GET(request: NextRequest) {
  try {
    const actor = await requireEntraideActor(request)
    return entraideJson(await getEntraideMatches(actor, createServiceClient()))
  } catch (error) {
    return entraideErrorResponse(error)
  }
}
