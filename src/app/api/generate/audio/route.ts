import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'
import { generateMusicAndWait } from '@/lib/suno'

export const runtime = 'nodejs'
export const maxDuration = 120

const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel voice

async function generateWithElevenLabs(text: string): Promise<string> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`ElevenLabs API error: ${res.status} — ${errorText}`)
  }

  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  return `data:audio/mpeg;base64,${base64}`
}

async function generateWithOpenAITTS(text: string, voice: string): Promise<string> {
  const validVoices = ['alloy', 'nova', 'shimmer', 'echo', 'fable', 'onyx']
  const safeVoice = validVoices.includes(voice) ? voice : 'alloy'

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: safeVoice,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenAI TTS error: ${res.status} — ${errorText}`)
  }

  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  return `data:audio/mpeg;base64,${base64}`
}

async function generateWithSuno(prompt: string): Promise<string> {
  const url = await generateMusicAndWait(prompt)
  if (!url) {
    throw new Error('La generation musicale prend plus de temps que prevu, reessaie dans une minute.')
  }
  return url
}

async function incrementUsage(service: ReturnType<typeof createServiceClient>, userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await service
    .from('usage_daily')
    .select('audio_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    await service
      .from('usage_daily')
      .update({ audio_count: (existing.audio_count ?? 0) + 1 })
      .eq('user_id', userId)
      .eq('date', today)
  } else {
    await service.from('usage_daily').insert({ user_id: userId, date: today, audio_count: 1 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    interface RequestBody {
      prompt: string
      model: 'elevenlabs' | 'openai-tts' | 'suno'
      voice?: string
    }
    const body = (await req.json()) as RequestBody
    const { prompt, model = 'openai-tts', voice = 'alloy' } = body

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
        .select('audio_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()
      const used = usage?.audio_count ?? 0
      if (used >= 30) {
        return NextResponse.json({ error: 'Quota journalier atteint (30 audios/jour)' }, { status: 429 })
      }
    }

    let resultUrl: string
    try {
      if (model === 'elevenlabs') {
        resultUrl = await generateWithElevenLabs(prompt.trim())
      } else if (model === 'suno') {
        resultUrl = await generateWithSuno(prompt.trim())
      } else {
        resultUrl = await generateWithOpenAITTS(prompt.trim(), voice)
      }
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : 'Erreur API'
      console.error('[generate/audio]', msg)
      return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
    }

    // Save generation
    const { data: gen } = await service
      .from('generations')
      .insert({
        user_id: user.id,
        type: 'audio',
        prompt: prompt.trim(),
        model,
        result_url: resultUrl.startsWith('data:') ? null : resultUrl,
        result_text: resultUrl.startsWith('data:') ? resultUrl.slice(0, 100) + '...' : null,
        metadata: { model, voice },
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
    console.error('[generate/audio] unexpected:', msg)
    return NextResponse.json({ error: 'Service temporairement indisponible, reessaie dans quelques instants' }, { status: 503 })
  }
}
