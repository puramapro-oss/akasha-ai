import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase'
import { assertCronAuth } from '@/lib/cron-auth'
import { EMAIL_SEQUENCE } from '@/lib/email-sequences/templates'
import { deliverSequence, utcSignupWindow } from '@/lib/email-sequences/delivery'
import { emailCohortPages, EmailRunBudget, EmailRunDeferred } from '@/lib/email-sequence-recipients'

// Admission stops at 45 s. The last claim has at most 50 s of bounded waits
// (DB 10 + provider 20 + completion 10 + reconciliation 10), leaving 25 s margin.
// Hosting enforcement still depends on the deployment's configured limits.
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authError = assertCronAuth(request)
  if (authError) return authError
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: "Le service d'envoi d'emails n'est pas configure." }, { status: 503 })
  }

  const now = new Date()
  const counts = { sent: 0, skipped: 0, failed: 0, reconciliation_required: 0 }
  let deferred = false
  try {
    const resend = new Resend(apiKey)
    const supabase = createServiceClient()
    const budget = new EmailRunBudget()
    for (const seq of EMAIL_SEQUENCE.filter(sequence => sequence.dayOffset >= 0)) {
      const window = utcSignupWindow(now, seq.dayOffset)
      try {
        for await (const users of emailCohortPages(supabase, seq.type, new Date(window.start), new Date(window.end), budget)) {
          for (const user of users) {
            budget.check()
            if (typeof user.email !== 'string' || !user.email.trim()) { counts.skipped++; continue }
            counts[await deliverSequence(supabase, resend, { ...user, email: user.email }, seq, budget)]++
            if (budget.capacityReached) {
              throw new EmailRunDeferred('Provider capacity reached')
            }
          }
        }
      } catch (error) {
        if (error instanceof EmailRunDeferred) { deferred = true; break }
        counts.failed++
      }
    }
  } catch { counts.failed++ }
  const partial = deferred || counts.failed > 0 || counts.reconciliation_required > 0
  return NextResponse.json({ status: partial ? 'partial' : 'ok', ...counts, deferred, timestamp: now.toISOString() }, {
    status: partial ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
