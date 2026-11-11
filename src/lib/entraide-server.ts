import 'server-only'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { computeMatchScore, type MutualAidProfile } from '@purama/entraide'
import { createServiceClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  MatchSchema, MatchesResponseSchema, OwnProfileSchema, type OwnProfile,
} from '@/lib/entraide-contracts'

export const OWN_PROFILE_COLUMNS =
  'user_id,skills_offered,skills_needed,availability_days,radius_km,location_lat,location_lng'
const CANDIDATE_LIMIT = 500
const BLOCK_BATCH_LIMIT = 100
type ServiceClient = ReturnType<typeof createServiceClient>

export class EntraideError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'EntraideError'
  }
}

export function entraideJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export function entraideErrorResponse(error: unknown) {
  if (error instanceof EntraideError) {
    return entraideJson({ error: error.message }, error.status)
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return entraideJson({ error: 'Données invalides' }, 400)
  }
  // Database/provider details can contain private data. Never return or log them here.
  return entraideJson({ error: 'Service Entraide indisponible' }, 503)
}

export async function requireEntraideActor(request: Request): Promise<string> {
  const header = request.headers.get('authorization')
  const bearer = header === null ? null : /^Bearer (\S+)$/i.exec(header)?.[1]
  if (header !== null && !bearer) throw new EntraideError(401, 'Non authentifié')

  const client = await createServerSupabaseClient()
  // An explicit bearer is authoritative: its failure must never fall back to cookies.
  const { data, error } = bearer
    ? await client.auth.getUser(bearer)
    : await client.auth.getUser()
  if (error || !data.user) {
    if (error && (!error.status || error.status >= 500)) {
      throw new EntraideError(503, 'Authentification indisponible')
    }
    throw new EntraideError(401, 'Non authentifié')
  }
  const id = z.string().uuid().safeParse(data.user.id)
  if (!id.success) throw new EntraideError(401, 'Non authentifié')
  return id.data
}

export function ownProfileProjection(value: unknown, actor?: string): OwnProfile {
  const result = OwnProfileSchema.safeParse(value)
  if (!result.success || (actor !== undefined && result.data.user_id !== actor)) {
    throw new EntraideError(503, 'Profil Entraide indisponible')
  }
  // Zod constructs a new object containing exactly these own-profile columns.
  return result.data
}

export async function getOwnEntraideProfile(actor: string, client: ServiceClient) {
  const { data, error } = await client.from('entraide_profils')
    .select(OWN_PROFILE_COLUMNS).eq('user_id', actor).maybeSingle()
  if (error) throw new EntraideError(503, 'Profil Entraide indisponible')
  return data === null ? null : ownProfileProjection(data, actor)
}

function matchingProfile(profile: OwnProfile, blockedUserIds: string[]): MutualAidProfile {
  return {
    userId: profile.user_id,
    skillsOffered: profile.skills_offered,
    skillsNeeded: profile.skills_needed,
    availabilityDays: profile.availability_days,
    radiusKm: profile.radius_km,
    location: profile.location_lat !== null && profile.location_lng !== null
      ? { lat: profile.location_lat, lng: profile.location_lng } : null,
    blockedUserIds,
  }
}

function validCount(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

async function getCandidateBlockedIds(actor: string, candidateIds: string[], client: ServiceClient) {
  const batches: string[][] = []
  for (let offset = 0; offset < candidateIds.length; offset += BLOCK_BATCH_LIMIT) {
    batches.push(candidateIds.slice(offset, offset + BLOCK_BATCH_LIMIT))
  }
  // At most ten bounded reads. Unrelated blocks cannot consume a candidate's response window.
  const pages = await Promise.all(batches.flatMap(batch => (['outgoing', 'incoming'] as const).map(async direction => {
    const actorColumn: 'blocker_id' | 'blocked_id' = direction === 'outgoing' ? 'blocker_id' : 'blocked_id'
    const peerColumn: 'blocker_id' | 'blocked_id' = direction === 'outgoing' ? 'blocked_id' : 'blocker_id'
    const result = await client.from('entraide_blocages')
      .select('blocker_id,blocked_id', { count: 'exact' })
      .eq(actorColumn, actor).in(peerColumn, batch).limit(batch.length)
    return { result, batch, actorColumn, peerColumn }
  })))
  const blockRows = z.array(z.object({ blocker_id: z.string().uuid(), blocked_id: z.string().uuid() }))
  const blockedIds = new Set<string>()
  for (const { result, batch, actorColumn, peerColumn } of pages) {
    const parsed = blockRows.safeParse(result.data)
    if (result.error || !validCount(result.count) || !parsed.success ||
      parsed.data.length !== result.count || parsed.data.length > batch.length) {
      throw new EntraideError(503, 'Correspondances indisponibles')
    }
    const candidates = new Set(batch)
    const seen = new Set<string>()
    for (const row of parsed.data) {
      const peer = row[peerColumn]
      if (row[actorColumn] !== actor || !candidates.has(peer) || seen.has(peer)) {
        throw new EntraideError(503, 'Correspondances indisponibles')
      }
      seen.add(peer)
      blockedIds.add(peer)
    }
  }
  return blockedIds
}

export async function getEntraideMatches(actor: string, client: ServiceClient) {
  const own = await getOwnEntraideProfile(actor, client)
  if (!own) return { matches: [], scanned_profiles: 0, truncated: false }

  const profiles = await client.from('entraide_profils').select(OWN_PROFILE_COLUMNS, { count: 'exact' })
    .neq('user_id', actor).order('user_id', { ascending: true }).limit(CANDIDATE_LIMIT + 1)
  if (profiles.error || !Array.isArray(profiles.data) || !validCount(profiles.count) ||
    profiles.count < profiles.data.length || profiles.data.length > CANDIDATE_LIMIT + 1) {
    throw new EntraideError(503, 'Correspondances indisponibles')
  }
  const allCandidates = profiles.data.map(value => ownProfileProjection(value))
  const identities = new Set<string>()
  for (const candidate of allCandidates) {
    if (candidate.user_id === actor || identities.has(candidate.user_id)) {
      throw new EntraideError(503, 'Correspondances indisponibles')
    }
    identities.add(candidate.user_id)
  }
  const candidates = allCandidates.slice(0, CANDIDATE_LIMIT)
  const blockedIds = await getCandidateBlockedIds(actor, candidates.map(candidate => candidate.user_id), client)
  const current = matchingProfile(own, [...blockedIds])
  const matches = candidates.map(candidate => {
    const result = computeMatchScore(current, matchingProfile(candidate, []))
    const match = MatchSchema.safeParse({ userId: candidate.user_id, score: result.score, reasons: result.reasons })
    if (!match.success) throw new EntraideError(503, 'Correspondances indisponibles')
    return match.data
  }).filter(match => match.score > 0 && !blockedIds.has(match.userId))
    .sort((left, right) => right.score - left.score || left.userId.localeCompare(right.userId))

  const result = MatchesResponseSchema.safeParse({
    matches, scanned_profiles: candidates.length,
    truncated: profiles.count > candidates.length,
  })
  if (!result.success) throw new EntraideError(503, 'Correspondances indisponibles')
  return result.data
}
