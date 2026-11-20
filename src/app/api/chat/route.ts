import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { streamClaude, getSystemPrompt } from '@/lib/claude'
import { PLAN_LIMITS, SUPER_ADMIN_EMAIL, DEFAULT_AKASHA_MODEL, isAkashaModelId, canUseAkashaModel } from '@/lib/constants'
import type { Plan } from '@/types'
import { z } from 'zod'
import { ratelimitCreative } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 120
// Below maxDuration so the client gets an explicit error event instead of a silent platform cut-off.
export const UPSTREAM_TIMEOUT_MS = 100_000

export const CHAT_ERRORS = {
  unauthorized: 'Connecte-toi pour discuter avec AKASHA.',
  rateLimited: 'Trop de requêtes récentes. Réessaie dans quelques instants.',
  invalid: 'Message invalide. Vérifie ton texte et réessaie.',
  conversationNotFound: 'Conversation introuvable. Ouvre une nouvelle conversation.',
  quota: 'Quota journalier atteint. Passe à un plan supérieur pour continuer.',
  timeout: 'AKASHA met trop de temps à répondre. Réessaie avec une question plus courte.',
  upstream: "La réponse d'AKASHA a été interrompue. Réessaie dans quelques instants.",
  notPersisted: "Cette réponse n'a pas pu être enregistrée dans l'historique.",
  server: 'Une erreur est survenue côté AKASHA. Réessaie dans quelques instants.',
} as const

const ChatBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  conversationId: z.string().optional(),
  model: z.string().optional(),
})

type Service = ReturnType<typeof createServiceClient>
type Outcome = 'completed' | 'cancelled' | 'timeout' | 'failed'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: CHAT_ERRORS.unauthorized }, { status: 401 })

    const { success } = await ratelimitCreative.limit(user.id)
    if (!success) return NextResponse.json({ error: CHAT_ERRORS.rateLimited }, { status: 429 })

    const parsed = ChatBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: CHAT_ERRORS.invalid, details: parsed.error.flatten() }, { status: 400 })
    }
    const { messages, conversationId, model: requestedModel } = parsed.data
    const akashaModel = requestedModel ?? DEFAULT_AKASHA_MODEL
    if (!isAkashaModelId(akashaModel)) {
      return NextResponse.json({ error: 'Modèle inconnu. Choisis un modèle dans la liste.', code: 'INVALID_MODEL' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('plan, daily_questions, email')
      .eq('id', user.id)
      .single()
    const plan = (profile?.plan ?? 'free') as Plan
    const metered = profile?.email !== SUPER_ADMIN_EMAIL

    if (!canUseAkashaModel(akashaModel, plan)) {
      return NextResponse.json({ error: 'Ce modèle est indisponible avec ton accès actuel. Choisis un autre modèle.', code: 'MODEL_UNAVAILABLE' }, { status: 403 })
    }

    if (conversationId && !(await ownsConversation(service, user.id, conversationId))) {
      return NextResponse.json({ error: CHAT_ERRORS.conversationNotFound }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]
    const quota = metered ? await quotaFor(service, user.id, plan, today) : undefined
    if (quota && quota.limit !== -1 && quota.used >= quota.limit) {
      return NextResponse.json({ error: CHAT_ERRORS.quota, code: 'quota_exceeded', limit: quota.limit, used: quota.used }, { status: 429 })
    }

    const currentConvId = conversationId ?? await createConversation(service, user.id, messages, akashaModel)

    const lastUserMsg = messages[messages.length - 1]
    if (lastUserMsg?.role === 'user' && currentConvId) {
      await service.from('messages').insert({ conversation_id: currentConvId, role: 'user', content: lastUserMsg.content })
    }

    // Reserve the quota unit before calling the provider; it is released only if no token was ever produced.
    if (quota) await writeUsage(service, user.id, today, quota.used + 1, quota.exists)

    const upstream = new AbortController()
    let outcome: Outcome = 'completed'
    const timer = setTimeout(() => { outcome = 'timeout'; upstream.abort() }, UPSTREAM_TIMEOUT_MS)
    const onClientAbort = () => { if (outcome === 'completed') outcome = 'cancelled'; upstream.abort() }
    req.signal?.addEventListener('abort', onClientAbort, { once: true })

    const encoder = new TextEncoder()
    let fullResponse = ''
    let closed = false

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)) }
          catch { closed = true }
        }
        try {
          if (currentConvId) send({ conversationId: currentConvId })
          for await (const chunk of streamClaude(messages, plan, getSystemPrompt(), akashaModel, upstream.signal)) {
            fullResponse += chunk
            send({ text: chunk })
          }
        } catch {
          if (outcome === 'completed') outcome = upstream.signal.aborted ? 'cancelled' : 'failed'
        } finally {
          clearTimeout(timer)
          req.signal?.removeEventListener('abort', onClientAbort)
        }

        if (outcome === 'timeout') send({ error: CHAT_ERRORS.timeout, code: 'timeout' })
        else if (outcome === 'failed') send({ error: CHAT_ERRORS.upstream, code: 'upstream' })

        if (fullResponse.length === 0 && quota) {
          await writeUsage(service, user.id, today, quota.used, true)
        } else if (currentConvId && fullResponse) {
          const { error } = await service.from('messages').insert({
            conversation_id: currentConvId, role: 'assistant', content: fullResponse, model: akashaModel,
          })
          if (error) send({ persisted: false, error: CHAT_ERRORS.notPersisted, code: 'not_persisted' })
        }

        send('[DONE]')
        if (!closed) { closed = true; controller.close() }
      },
      cancel() {
        closed = true
        onClientAbort()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch {
    return NextResponse.json({ error: CHAT_ERRORS.server }, { status: 500 })
  }
}

async function ownsConversation(service: Service, userId: string, conversationId: string): Promise<boolean> {
  const { data } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

async function createConversation(
  service: Service, userId: string, messages: { role: string; content: string }[], model: string,
): Promise<string | undefined> {
  const firstMsg = messages.find(m => m.role === 'user')?.content ?? 'Nouvelle conversation'
  const { data } = await service
    .from('conversations')
    .insert({ user_id: userId, title: firstMsg.slice(0, 60), model })
    .select('id')
    .single()
  return data?.id ?? undefined
}

async function quotaFor(
  service: Service, userId: string, plan: Plan, today: string,
): Promise<{ used: number; limit: number; exists: boolean }> {
  const { data: usage } = await service
    .from('usage_daily')
    .select('chat_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()
  const planLimits = PLAN_LIMITS[plan]
  const rawLimit = plan === 'free'
    ? PLAN_LIMITS.free.daily_questions
    : (planLimits && 'essential' in planLimits ? planLimits.essential.daily_questions : 10)
  return { used: usage?.chat_count ?? 0, limit: rawLimit as number, exists: Boolean(usage) }
}

// Read-then-write, not atomic under concurrent requests (no counter RPC in the schema): known gap.
async function writeUsage(service: Service, userId: string, today: string, chatCount: number, exists: boolean): Promise<void> {
  if (exists) {
    await service
      .from('usage_daily')
      .update({ chat_count: Math.max(0, chatCount) })
      .eq('user_id', userId)
      .eq('date', today)
  } else {
    await service.from('usage_daily').insert({ user_id: userId, date: today, chat_count: chatCount })
  }
}
