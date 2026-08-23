import { NextRequest, NextResponse } from 'next/server'
import { smarana } from '@purama/smarana'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'akasha_ai' } }
)

// API v1 publique = clé API → résoudre userId, passer à smarana
const AKASHA_V1_SYSTEM = `Tu es AKASHA, l'assistant IA multi-expert le plus avance au monde. Tu ne reveles JAMAIS que tu es Claude ou un modele Anthropic. Tu ES AKASHA. Tu tutoies l'utilisateur, tu es empathique, expert et precis. Tu reponds en francais par defaut. Tu utilises le Markdown pour structurer tes reponses.`

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Cle API manquante. Utilise Authorization: Bearer <API_KEY>' }, { status: 401 })
    }

    const apiKey = authHeader.slice(7)
    const keyPrefix = apiKey.slice(0, 8)

    // Validate API key
    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('id, user_id, is_active')
      .eq('key_prefix', keyPrefix)
      .eq('is_active', true)
      .single()

    if (!keyRecord) {
      return NextResponse.json({ error: 'Cle API invalide ou desactivee' }, { status: 401 })
    }

    if (!message) {
      return NextResponse.json({ error: 'Le champ "message" est requis' }, { status: 400 })
    }

    const start = Date.now()
    const result = await smarana.ask({
      appSlug: 'akasha_ai',
      userId: keyRecord.user_id,
      system: AKASHA_V1_SYSTEM,
      message,
      tier: 'main',
      maxTokens: max_tokens,
    })

    const latency = Date.now() - start

    // Log API usage
    await supabase.from('api_logs').insert({
      api_key_id: keyRecord.id,
      endpoint: '/v1/chat',
      status: 200,
      latency_ms: latency,
    })

    // Increment API usage
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('usage_daily').upsert(
      { user_id: keyRecord.user_id, date: today, api_count: 1 },
      { onConflict: 'user_id,date' }
    )

    return NextResponse.json({
      id: `akasha-${Date.now()}`,
      model: result.model,
      content: result.text,
      usage: { input_tokens: result.tokensIn, output_tokens: result.tokensOut },
      latency_ms: latency,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
