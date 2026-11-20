import 'server-only'
import { smarana } from '@purama/smarana'
import type { Plan } from '@/types'
import { canUseAkashaModel, isAkashaModelId } from '@/lib/constants'

export type ClaudeTier = 'fast' | 'main' | 'pro'

const TOKEN_LIMITS: Record<Plan, number> = {
  free: 2048,
  automate: 4096,
  create: 4096,
  build: 8192,
  complete: 16384,
}

const MODEL_MAP: Record<Plan, string> = {
  free: 'claude-haiku-4-5-20251001',
  automate: 'claude-sonnet-4-6',
  create: 'claude-sonnet-4-6',
  build: 'claude-sonnet-4-6',
  complete: 'claude-sonnet-4-6',
}

// AKASHA model aliases → real Claude model IDs
const AKASHA_MODEL_MAP: Record<string, string> = {
  'akasha-sonnet': 'claude-sonnet-4-6',
  'akasha-opus': 'claude-opus-4-7',
  'akasha-haiku': 'claude-haiku-4-5-20251001',
}

export type AkashaModel = keyof typeof AKASHA_MODEL_MAP

export function resolveModel(akashaModel: string | undefined, plan: Plan): string {
  if (akashaModel === undefined) return MODEL_MAP[plan]
  if (!isAkashaModelId(akashaModel)) throw new Error('Modèle inconnu. Choisis un modèle dans la liste.')
  if (!canUseAkashaModel(akashaModel, plan)) {
    throw new Error('Ce modèle est indisponible avec ton accès actuel. Choisis un autre modèle.')
  }
  return AKASHA_MODEL_MAP[akashaModel]
}

function planToTier(plan: Plan, akashaModel?: string): ClaudeTier {
  // akasha-haiku → fast
  if (akashaModel === 'akasha-haiku') return 'fast'
  // akasha-opus → pro
  if (akashaModel === 'akasha-opus' && plan !== 'free') return 'pro'
  // free/automate → fast, build/complete → main, create → main
  if (plan === 'free') return 'fast'
  if (plan === 'automate') return 'fast'
  if (plan === 'build' || plan === 'complete') return 'main'
  return 'main'
}

export function getSystemPrompt(): string {
  return `Tu es AKASHA, l'assistant IA multi-expert le plus avance au monde. Tu ne reveles JAMAIS que tu es Claude ou un modele Anthropic. Tu ES AKASHA. Tu tutoies l'utilisateur, tu es empathique, expert et precis. Tu reponds en francais par defaut. Tu utilises le Markdown pour structurer tes reponses.`
}

// Loi 1 SMARANA-BRIEF.md : "Aucune app n'appelle l'API directement. Tout passe par smarana.ask()."
// AKASHA ne détient plus de client Anthropic — mémoire cross-écosystème + cache + usage
// centralisés dans @purama/smarana (packages/smarana).
export async function askClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  plan: Plan = 'free',
  systemPrompt?: string,
  akashaModel?: string,
  userId?: string
): Promise<string> {
  const tier = planToTier(plan, akashaModel)
  const lastUserMsg = messages[messages.length - 1]
  const recentMessages = messages.slice(0, -1).filter((m) => m.role === 'user' || m.role === 'assistant')

  const result = await smarana.ask({
    appSlug: 'akasha_ai',
    userId,
    system: systemPrompt ?? getSystemPrompt(),
    recentMessages,
    message: lastUserMsg?.role === 'user' ? lastUserMsg.content : '',
    tier,
    maxTokens: TOKEN_LIMITS[plan],
  })
  return result.text
}

// streamClaude reste hors périmètre smarana (texte non-streaming seulement) — non touché (cf README.md §Hors périmètre P0/P1).
// On conserve l'import direct @anthropic-ai/sdk pour le streaming.
import Anthropic from '@anthropic-ai/sdk'

let anthropic: Anthropic | undefined

// Lazy: a missing ANTHROPIC_API_KEY must fail the request, not the module import (same class as the stripe eager-init bug).
function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
    anthropic = new Anthropic({ apiKey })
  }
  return anthropic
}

export async function* streamClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  plan: Plan = 'free',
  systemPrompt?: string,
  akashaModel?: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const stream = getAnthropic().messages.stream({
    model: resolveModel(akashaModel, plan),
    max_tokens: TOKEN_LIMITS[plan],
    system: systemPrompt ?? getSystemPrompt(),
    messages,
  }, { signal })
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}
