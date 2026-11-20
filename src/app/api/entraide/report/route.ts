import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { z } from 'zod'
import { shouldAutoSuspendProfile } from '@purama/entraide'
import { reportProfile, getActiveReportCount } from '@/lib/entraide'
import {
  requireEntraideActor, entraideJson, entraideErrorResponse,
} from '@/lib/entraide-server'

const ReportSchema = z.object({
  target_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
})

export async function POST(req: NextRequest) {
  try {
    const actor = await requireEntraideActor(req)
    const validated = ReportSchema.parse(await req.json())

    if (validated.target_id.toLowerCase() === actor.toLowerCase()) {
      return entraideJson({ error: 'Impossible de se signaler soi-même' }, 400)
    }

    const serviceSupabase = createServiceClient()
    await reportProfile(serviceSupabase, actor, validated.target_id, validated.reason)
    const activeReportCount = await getActiveReportCount(serviceSupabase, validated.target_id)
    const shouldSuspend = shouldAutoSuspendProfile(activeReportCount)

    return entraideJson({
      success: true,
      should_suspend: shouldSuspend,
      active_report_count: activeReportCount,
    })
  } catch (error) {
    return entraideErrorResponse(error)
  }
}
