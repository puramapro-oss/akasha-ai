import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { canSendContactRequest, respondToContactRequest } from '@purama/entraide'
import {
  getContactRequestsSentToday,
  getPendingRequestToRecipient,
  getLastDeclineOrExpiry,
  getBlockedUserIds,
  insertContactRequest,
  updateContactRequestStatus,
} from '@/lib/entraide'

const SendRequestSchema = z.object({
  recipient_id: z.string().uuid(),
  message: z.string().max(500).nullable(),
})

const RespondSchema = z.object({
  request_id: z.string().uuid(),
  response: z.enum(['accept', 'decline', 'block']),
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
    const serviceSupabase = createServiceClient()

    // Send new contact request
    if ('recipient_id' in body) {
      const validated = SendRequestSchema.parse(body)

      // Check eligibility via lib pure function
      const blockedByRecipient = (await getBlockedUserIds(serviceSupabase, validated.recipient_id)).includes(
        user.id
      )
      const requestsSentToday = await getContactRequestsSentToday(serviceSupabase, user.id)
      const hasPending = await getPendingRequestToRecipient(
        serviceSupabase,
        user.id,
        validated.recipient_id
      )
      const lastDecline = await getLastDeclineOrExpiry(
        serviceSupabase,
        user.id,
        validated.recipient_id
      )

      const decision = canSendContactRequest({
        requesterId: user.id,
        recipientId: validated.recipient_id,
        isBlockedByRecipient: blockedByRecipient,
        requesterRequestsSentToday: requestsSentToday,
        hasPendingRequestToSameRecipient: hasPending,
        lastDeclineOrExpiryToSameRecipient: lastDecline,
        now: new Date(),
      })

      if (!decision.allowed) {
        return NextResponse.json({ error: decision.reason }, { status: 400 })
      }

      const requestId = await insertContactRequest(
        serviceSupabase,
        user.id,
        validated.recipient_id,
        validated.message
      )

      return NextResponse.json({ request_id: requestId })
    }

    // Respond to contact request
    const validated = RespondSchema.parse(body)

    // Get current status
    const { data: request } = await serviceSupabase
      .from('entraide_contact_requests')
      .select('status, recipient_id')
      .eq('id', validated.request_id)
      .single()

    if (!request || request.recipient_id !== user.id) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    }

    const result = respondToContactRequest(request.status, validated.response)

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    await updateContactRequestStatus(serviceSupabase, validated.request_id, result.status)

    // If block, also add to blocages table
    if (validated.response === 'block') {
      const { data: requestData } = await serviceSupabase
        .from('entraide_contact_requests')
        .select('requester_id')
        .eq('id', validated.request_id)
        .single()

      if (requestData) {
        await serviceSupabase.from('entraide_blocages').insert({
          blocker_id: user.id,
          blocked_id: requestData.requester_id,
        })
      }
    }

    return NextResponse.json({ status: result.status })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 })
    }
    console.error('[entraide/contacts POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
