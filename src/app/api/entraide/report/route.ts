import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { shouldAutoSuspendProfile } from '@purama/entraide'
import { reportProfile, getActiveReportCount } from '@/lib/entraide'

const ReportSchema = z.object({
  target_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
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
    const validated = ReportSchema.parse(body)

    if (validated.target_id === user.id) {
      return NextResponse.json({ error: 'Impossible de se signaler soi-même' }, { status: 400 })
    }

    const serviceSupabase = createServiceClient()

    await reportProfile(serviceSupabase, user.id, validated.target_id, validated.reason)

    const activeReportCount = await getActiveReportCount(serviceSupabase, validated.target_id)
    const shouldSuspend = shouldAutoSuspendProfile(activeReportCount)

    return NextResponse.json({
      success: true,
      should_suspend: shouldSuspend,
      active_report_count: activeReportCount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 })
    }
    console.error('[entraide/report POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
