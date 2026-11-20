import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'

export const runtime = 'nodejs'
export const maxDuration = 120

interface LTXPrediction {
  id?: string
  status?: string
  video_url?: string
  url?: string
  output?: string
}

async function generateWithLTX(prompt: string, duration: number): Promise<{ url: string | null; status: 'pending' | 'ready' | 'error' }> {
  const ltxKey = process.env.LTX_API_KEY ?? ''
  if (!ltxKey) {
    throw new Error('LTX API key not configured')
  }

  // Try LTX Video API — structure based on common video gen API patterns
  // R3 chaos : sans timeout, un hang bloquait la route entière jusqu'à épuisement
  // de maxDuration=120s (Vercel), sans message d'erreur clair pour l'utilisateur.
  const res = await fetch('https://api.ltxstudio.com/v1/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ltxKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      duration: Math.min(Math.max(duration, 2), 10),
      resolution: '720p',
      fps: 24,
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`LTX API error: ${res.status} — ${errorText}`)
  }

  const data = (await res.json()) as LTXPrediction
  const videoUrl = data.video_url ?? data.url ?? data.output ?? null
  const status = videoUrl ? 'ready' : (data.status === 'pending' ? 'pending' : 'ready')

  return { url: videoUrl, status: status as 'pending' | 'ready' | 'error' }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    interface RequestBody {
      prompt: string
      duration?: number
    }
    const body = (await req.json()) as RequestBody
    const { prompt, duration = 4 } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt requis' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single()
    const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL

    // Quota check
    if (!isSuperAdmin) {
      const today = new Date().toISOString().split('T')[0]
      const { data: usage } = await service
        .from('usage_daily')
        .select('video_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()
      const used = usage?.video_count ?? 0
      if (used >= 5) {
        return NextResponse.json({ error: 'Quota journalier atteint (5 videos/jour)' }, { status: 429 })
      }
    }

    let resultUrl: string | null = null
    let generationStatus: 'pending' | 'ready' | 'error' = 'error'

    try {
      const result = await generateWithLTX(prompt.trim(), duration)
      resultUrl = result.url
      generationStatus = result.status
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : 'Erreur API'
      console.error('[generate/video] LTX error:', msg)
      return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
    }

    // Save generation if successful
    let genId = ''
    if (generationStatus !== 'error') {
      const { data: gen } = await service
        .from('generations')
        .insert({
          user_id: user.id,
          type: 'video',
          prompt: prompt.trim(),
          model: 'ltx',
          result_url: resultUrl,
          metadata: { duration, model: 'ltx' },
        })
        .select('id')
        .single()
      genId = gen?.id ?? ''
    }

    // Increment usage
    if (!isSuperAdmin && generationStatus !== 'error') {
      const today = new Date().toISOString().split('T')[0]
      const { data: existing } = await service
        .from('usage_daily')
        .select('video_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()

      if (existing) {
        await service
          .from('usage_daily')
          .update({ video_count: (existing.video_count ?? 0) + 1 })
          .eq('user_id', user.id)
          .eq('date', today)
      } else {
        await service.from('usage_daily').insert({ user_id: user.id, date: today, video_count: 1 })
      }
    }

    return NextResponse.json({ url: resultUrl, id: genId, status: generationStatus })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[generate/video] unexpected:', msg)
    return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
  }
}
