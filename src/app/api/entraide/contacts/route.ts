import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEntraideActor, entraideJson, entraideErrorResponse, EntraideError } from '@/lib/entraide-server'
import { z } from 'zod'
import { canSendContactRequest, respondToContactRequest } from '@purama/entraide'
import {
  getContactRequestsSentToday, getPendingRequestToRecipient, getLastDeclineOrExpiry,
  getBlockedUserIds, insertContactRequest, updateContactRequestStatus,
} from '@/lib/entraide'

const ContactIdSchema = z.string().uuid().transform(value => value.toLowerCase())

const SendRequestSchema = z.object({
  recipient_id: ContactIdSchema,
  message: z.string().max(500).nullable(),
})
const RespondSchema = z.object({
  request_id: ContactIdSchema,
  response: z.enum(['accept', 'decline', 'block']),
})

export async function POST(req: NextRequest) {
  try {
    const user = { id: (await requireEntraideActor(req)).toLowerCase() }
    const body = await req.json()
    const serviceSupabase = createServiceClient()

    if (body && typeof body === 'object' && 'recipient_id' in body) {
      const validated = SendRequestSchema.parse(body)
      const blockedByRecipient = (await getBlockedUserIds(
        serviceSupabase, validated.recipient_id, user.id
      )).length > 0
      const requestsSentToday = await getContactRequestsSentToday(serviceSupabase, user.id)
      const hasPending = await getPendingRequestToRecipient(serviceSupabase, user.id, validated.recipient_id)
      const lastDecline = await getLastDeclineOrExpiry(serviceSupabase, user.id, validated.recipient_id)
      const decision = canSendContactRequest({
        requesterId: user.id, recipientId: validated.recipient_id,
        isBlockedByRecipient: blockedByRecipient,
        requesterRequestsSentToday: requestsSentToday,
        hasPendingRequestToSameRecipient: hasPending,
        lastDeclineOrExpiryToSameRecipient: lastDecline, now: new Date(),
      })
      if (!decision.allowed) return entraideJson({ error: decision.reason }, 400)
      const requestId = await insertContactRequest(
        serviceSupabase, user.id, validated.recipient_id, validated.message
      )
      return entraideJson({ request_id: requestId })
    }

    const validated = RespondSchema.parse(body)
    const { data: request, error } = await serviceSupabase
      .from('entraide_contact_requests')
      .select('id,status,recipient_id,requester_id')
      .eq('id', validated.request_id).eq('recipient_id', user.id).maybeSingle()
    if (error) throw new EntraideError(503, 'Demande indisponible')
    if (!request || request.recipient_id !== user.id || request.id !== validated.request_id) {
      return entraideJson({ error: 'Demande introuvable' }, 404)
    }

    // Confirming an existing block is an idempotent replay, not a new state transition.
    const replayBlock = validated.response === 'block' && request.status === 'blocked'
    const result = replayBlock
      ? { ok: true as const, status: 'blocked' as const }
      : respondToContactRequest(request.status, validated.response)
    if (!result.ok) return entraideJson({ error: result.reason }, 400)

    // Protect first, then advance the request state. Retrying after a status-write
    // failure remains possible: the pending request still exists and the block is idempotent.
    if (validated.response === 'block') {
      if (!z.string().uuid().safeParse(request.requester_id).success) {
        throw new EntraideError(503, 'Demande indisponible')
      }
      const { error: blockError } = await serviceSupabase.from('entraide_blocages').upsert({
        blocker_id: user.id, blocked_id: request.requester_id,
      }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })
      if (blockError) throw new EntraideError(503, 'Blocage indisponible')
    }
    if (!replayBlock) await updateContactRequestStatus(serviceSupabase, validated.request_id, result.status)
    return entraideJson({ status: result.status })
  } catch (error) {
    return entraideErrorResponse(error)
  }
}
