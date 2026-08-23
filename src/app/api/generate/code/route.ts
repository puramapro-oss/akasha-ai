import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { askClaude } from '@/lib/claude'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'
import type { Plan } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const CODE_SYSTEM_PROMPT = `Tu es un expert developpeur senior. Genere UNIQUEMENT le code demande, sans explication, sans introduction, sans conclusion. Dans le langage precise. Pas de markdown fence (pas de triple backtick). Juste le code brut, pret a copier-coller.`

async function incrementUsage(service: ReturnType<typeof createServiceClient>, userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await service
    .from('usage_daily')
    .select('code_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    await service
      .from('usage_daily')
      .update({ code_count: (existing.code_count ?? 0) + 1 })
      .eq('user_id', userId)
      .eq('date', today)
  } else {
    await service.from('usage_daily').insert({ user_id: userId, date: today, code_count: 1 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    interface RequestBody {
      prompt: string
      language?: string
    }
    const body = (await req.json()) as RequestBody
    const { prompt, language = 'TypeScript' } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt requis' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('email, plan')
      .eq('id', user.id)
      .single()

    const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL
    const plan = (profile?.plan ?? 'free') as Plan

    // Quota check
    if (!isSuperAdmin) {
      const today = new Date().toISOString().split('T')[0]
      const { data: usage } = await service
        .from('usage_daily')
        .select('code_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()
      const used = usage?.code_count ?? 0
      if (used >= 50) {
        return NextResponse.json({ error: 'Quota journalier atteint (50 generations/jour)' }, { status: 429 })
      }
    }

    const fullPrompt = `Langage: ${language}\n\nTache: ${prompt.trim()}`

    let code: string
    try {
      code = await askClaude(
        [{ role: 'user', content: fullPrompt }],
        plan,
        CODE_SYSTEM_PROMPT,
        undefined,
        user.id
      )
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : 'Erreur API'
      console.error('[generate/code]', msg)
      return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
    }

    // Strip accidental markdown fences if Claude added them
    const cleanCode = code
      .replace(/^```[\w]*\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim()

    // Save generation
    const { data: gen } = await service
      .from('generations')
      .insert({
        user_id: user.id,
        type: 'code',
        prompt: prompt.trim(),
        model: 'claude',
        result_text: cleanCode,
        metadata: { language },
      })
      .select('id')
      .single()

    // Increment usage
    if (!isSuperAdmin) {
      await incrementUsage(service, user.id)
    }

    return NextResponse.json({ code: cleanCode, id: gen?.id ?? '' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[generate/code] unexpected:', msg)
    return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
  }
}
