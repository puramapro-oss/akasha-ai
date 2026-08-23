import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { askClaude } from '@/lib/claude'
import { PRESET_AGENTS } from '@/lib/preset-agents'
import type { Plan } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as { agentId?: string; prompt?: string }
    const { agentId, prompt } = body

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'agentId requis' }, { status: 400 })
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'prompt requis' }, { status: 400 })
    }

    // Get plan
    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    const plan = (profile?.plan ?? 'free') as Plan

    // Find agent — preset first, then DB
    let systemPrompt: string | undefined

    const presetAgent = PRESET_AGENTS.find((a) => a.id === agentId)
    if (presetAgent) {
      systemPrompt = presetAgent.system_prompt
    } else {
      // Try DB
      const { data: dbAgent } = await service
        .from('agents')
        .select('system_prompt, is_active')
        .eq('id', agentId)
        .maybeSingle()

      if (!dbAgent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
      if (dbAgent.is_active === false) return NextResponse.json({ error: 'Agent inactif' }, { status: 400 })
      systemPrompt = dbAgent.system_prompt as string
    }

    const response = await askClaude(
      [{ role: 'user', content: prompt.trim() }],
      plan,
      systemPrompt,
      undefined,
      user.id
    )

    return NextResponse.json({ response })
  } catch (err) {
    console.error('[agents/run]', err)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
