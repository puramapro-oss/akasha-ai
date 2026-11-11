import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string[] | null
  error?: string | null
  urls?: { get: string }
}

async function generateWithFlux(prompt: string): Promise<string> {
  // R3 chaos : sans timeout sur cet appel, un hang empêchait le fallback vers
  // Pollinations (ligne ~180) de se déclencher dans un délai raisonnable —
  // fallback non borné, exactement le défaut visé par la campagne fetch-resilience.
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-1.1-pro',
      input: {
        prompt,
        aspect_ratio: '16:9',
      },
    }),
    signal: AbortSignal.timeout(70_000),
  })

  if (!createRes.ok) {
    const errorText = await createRes.text()
    throw new Error(`Replicate API error: ${createRes.status} — ${errorText}`)
  }

  const prediction = (await createRes.json()) as ReplicatePrediction

  // If sync wait succeeded
  if (prediction.status === 'succeeded' && prediction.output) {
    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
    return out as string
  }

  // Poll up to 60s
  const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`
  const start = Date.now()
  while (Date.now() - start < 60_000) {
    await new Promise(r => setTimeout(r, 2000))
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!pollRes.ok) continue
    const polled = (await pollRes.json()) as ReplicatePrediction
    if (polled.status === 'succeeded' && polled.output) {
      const out = Array.isArray(polled.output) ? polled.output[0] : polled.output
      return out as string
    }
    if (polled.status === 'failed' || polled.status === 'canceled') {
      throw new Error(`FLUX generation ${polled.status}: ${polled.error ?? 'unknown'}`)
    }
  }
  throw new Error('FLUX generation timed out after 60s')
}

async function generateWithPollinations(prompt: string, size: string): Promise<string> {
  // Pollinations.ai — generation gratuite, sans cle API, modele Flux par defaut
  const [w, h] = size.split('x').map(n => parseInt(n, 10) || 1024)
  const seed = Math.floor(Math.random() * 1_000_000)
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=flux&enhance=true&nologo=true&seed=${seed}`
  // Verifie que l'image existe (Pollinations renvoie un 200 + image binary)
  const head = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(30_000) })
  if (!head.ok) throw new Error(`Pollinations error ${head.status}`)
  return url
}

async function generateWithDallE(prompt: string, size: string): Promise<string> {
  const validSizes = ['1024x1024', '1792x1024', '1024x1792']
  const safeSize = validSizes.includes(size) ? size : '1024x1024'

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      size: safeSize,
      n: 1,
      response_format: 'url',
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`DALL-E API error: ${res.status} — ${errorText}`)
  }

  interface DallEResponse {
    data: Array<{ url?: string; b64_json?: string }>
  }
  const data = (await res.json()) as DallEResponse
  const url = data.data?.[0]?.url
  if (!url) throw new Error('DALL-E returned no image URL')
  return url
}

async function incrementUsage(service: ReturnType<typeof createServiceClient>, userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await service
    .from('usage_daily')
    .select('image_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    await service
      .from('usage_daily')
      .update({ image_count: (existing.image_count ?? 0) + 1 })
      .eq('user_id', userId)
      .eq('date', today)
  } else {
    await service.from('usage_daily').insert({ user_id: userId, date: today, image_count: 1 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    interface RequestBody {
      prompt: string
      model: 'flux' | 'dalle' | 'imagen'
      size?: string
      n?: number
    }
    const body = (await req.json()) as RequestBody
    const { prompt, model = 'flux', size = '1024x1024' } = body

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
        .select('image_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()
      const used = usage?.image_count ?? 0
      if (used >= 20) {
        return NextResponse.json({ error: 'Quota journalier atteint (20 images/jour)' }, { status: 429 })
      }
    }

    let resultUrl: string
    try {
      if (model === 'flux') {
        // Try Replicate FLUX first; fallback to Pollinations Flux if Replicate token missing or fails
        if (process.env.REPLICATE_API_TOKEN) {
          try {
            resultUrl = await generateWithFlux(prompt.trim())
          } catch {
            resultUrl = await generateWithPollinations(prompt.trim(), size)
          }
        } else {
          resultUrl = await generateWithPollinations(prompt.trim(), size)
        }
      } else if (model === 'imagen') {
        // Imagen via Pollinations (Flux backbone, modele "imagen-like" a haute fidelite)
        resultUrl = await generateWithPollinations(prompt.trim(), size)
      } else {
        resultUrl = await generateWithDallE(prompt.trim(), size)
      }
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : 'Erreur API'
      console.error('[generate/image]', msg)
      return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
    }

    // Save generation
    const { data: gen } = await service
      .from('generations')
      .insert({
        user_id: user.id,
        type: 'image',
        prompt: prompt.trim(),
        model,
        result_url: resultUrl,
        metadata: { size, model },
      })
      .select('id')
      .single()

    // Increment usage
    if (!isSuperAdmin) {
      await incrementUsage(service, user.id)
    }

    return NextResponse.json({ url: resultUrl, id: gen?.id ?? '' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[generate/image] unexpected:', msg)
    return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
  }
}
