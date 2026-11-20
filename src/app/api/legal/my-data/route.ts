/**
 * GET /api/legal/my-data — export complet des données personnelles au format JSON
 * (droit à la portabilité, art. 20 RGPD ; page « Ma mémoire »). Lit réellement les
 * tables métier d'AKASHA AI contenant des données personnelles, jamais un stub.
 *
 * `messages` n'a pas de colonne `user_id` directe (scopée par `conversation_id`) — export
 * séparément via un join sur les conversations de l'utilisateur.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
// @purama/smarana gère son propre pool pg interne (packages/smarana/src/db.ts),
// totalement indépendant du client Supabase de l'app — même connexion PAS requise
// pour cet export (cf. import déjà en place dans lib/claude.ts, api/v1/chat, api/aide/chat).
// SYNC POINT : `smarana.memory.getForExport` vient d'être ajouté dans le worktree
// isolé ~/purama-worktrees/smarana-r5-consent-gate (commit 01e4f61), pas encore
// intégré dans la version installée d'akasha-ai (package.json pointe sur
// github:puramapro-oss/purama-smarana#main). Cet appel restera en échec silencieux
// (memoire_ia.disponible=false) tant que ce commit n'est pas mergé + réinstallé.
import { smarana } from '@purama/smarana'

/**
 * Forme attendue de `smarana.memory.getForExport(userId, appSlug)` une fois le
 * commit 01e4f61 (~/purama-worktrees/smarana-r5-consent-gate) mergé dans
 * @purama/smarana#main et réinstallé ici. La version actuellement installée
 * n'expose que `memory.get` / `memory.processDueJobs` — ce type + le feature
 * detection ci-dessous permettent de câbler l'appel sans casser tsc tant que
 * la synchro n'a pas eu lieu, et sans `any` (interdit — CLAUDE.md §REVIEW).
 */
interface SmaranaMemoryExportResult {
  consentRevoked: boolean
  entries: Array<{ scope: string; profile: unknown; summary: string; updatedAt: string }>
}
interface SmaranaMemoryModuleWithExport {
  getForExport?: (userId: string, appSlug: string) => Promise<SmaranaMemoryExportResult>
}

const EXTRA_TABLES: Array<{ table: string; userIdColumn: string }> = [
  { table: 'generations', userIdColumn: 'user_id' },
  { table: 'wallets', userIdColumn: 'user_id' },
  { table: 'wallet_transactions', userIdColumn: 'user_id' },
  { table: 'withdrawals', userIdColumn: 'user_id' },
  { table: 'connect_withdrawals', userIdColumn: 'user_id' },
  { table: 'referrals', userIdColumn: 'user_id' },
  { table: 'commissions', userIdColumn: 'user_id' },
  { table: 'invoices', userIdColumn: 'user_id' },
  { table: 'payments', userIdColumn: 'user_id' },
  { table: 'xp_log', userIdColumn: 'user_id' },
  { table: 'streaks', userIdColumn: 'user_id' },
  { table: 'notifications', userIdColumn: 'user_id' },
  { table: 'gratitude_entries', userIdColumn: 'user_id' },
  { table: 'user_achievements', userIdColumn: 'user_id' },
  { table: 'user_badges', userIdColumn: 'user_id' },
  { table: 'contest_entries', userIdColumn: 'user_id' },
  { table: 'lottery_tickets', userIdColumn: 'user_id' },
  { table: 'lottery_winners', userIdColumn: 'user_id' },
  { table: 'social_shares', userIdColumn: 'user_id' },
  { table: 'daily_gifts', userIdColumn: 'user_id' },
  { table: 'point_transactions', userIdColumn: 'user_id' },
  { table: 'purama_points', userIdColumn: 'user_id' },
  { table: 'support_tickets', userIdColumn: 'user_id' },
  { table: 'user_coupons', userIdColumn: 'user_id' },
  { table: 'dossiers_financement', userIdColumn: 'user_id' },
  { table: 'api_keys', userIdColumn: 'user_id' },
  { table: 'api_logs', userIdColumn: 'user_id' },
  { table: 'influencer_profiles', userIdColumn: 'user_id' },
  { table: 'influencer_stats', userIdColumn: 'user_id' },
  { table: 'email_sequences', userIdColumn: 'user_id' },
  { table: 'agents', userIdColumn: 'user_id' },
  { table: 'workflows', userIdColumn: 'user_id' },
  { table: 'agent_installs', userIdColumn: 'user_id' },
  { table: 'collab_members', userIdColumn: 'user_id' },
]

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 })

  const [{ data: profile }, { data: acceptances }, { data: cookieConsent }, { data: conversations }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('legal_acceptances').select('doc_type, version, accepted_at').eq('user_id', user.id),
      supabase.from('cookie_consents').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('conversations').select('*').eq('user_id', user.id),
    ])

  const conversationIds = (conversations ?? []).map((c: { id: string }) => c.id)
  const { data: messages } =
    conversationIds.length > 0
      ? await supabase.from('messages').select('*').in('conversation_id', conversationIds)
      : { data: [] }

  const extra: Record<string, unknown> = {}
  for (const { table, userIdColumn } of EXTRA_TABLES) {
    const { data } = await supabase.from(table).select('*').eq(userIdColumn, user.id)
    extra[table] = data ?? []
  }

  // Mémoire IA SMARANA (Couche 3) — export best-effort. Le package gère son propre
  // pool pg (indépendant de Supabase), donc une panne ici ne doit jamais faire
  // échouer le reste de l'export légal (Loi 15 : dégradation propre).
  let memoireIa: { disponible: boolean; consentementRevoque: boolean; entrees: unknown[] } = {
    disponible: false,
    consentementRevoque: false,
    entrees: [],
  }
  try {
    const memoryModule = smarana.memory as unknown as SmaranaMemoryModuleWithExport
    if (typeof memoryModule.getForExport === 'function') {
      const result = await memoryModule.getForExport(user.id, 'akasha_ai')
      memoireIa = {
        disponible: true,
        consentementRevoque: result.consentRevoked,
        entrees: result.entries,
      }
    }
    // sinon : package @purama/smarana pas encore synchronisé (cf. SYNC POINT ci-dessus)
    // → memoireIa reste { disponible: false } sans faire échouer l'export
  } catch {
    // pool smarana indisponible / erreur DB interne → export continue sans mémoire IA (Loi 15)
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    compte: { id: user.id, email: user.email, createdAt: user.created_at },
    profile: profile ?? null,
    acceptationsLegales: acceptances ?? [],
    consentementCookies: cookieConsent ?? null,
    conversations: conversations ?? [],
    messages: messages ?? [],
    memoire_ia: memoireIa,
    ...extra,
  }

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="mes-donnees.json"',
    },
  })
}
