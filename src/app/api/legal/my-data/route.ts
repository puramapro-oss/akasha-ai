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

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    compte: { id: user.id, email: user.email, createdAt: user.created_at },
    profile: profile ?? null,
    acceptationsLegales: acceptances ?? [],
    consentementCookies: cookieConsent ?? null,
    conversations: conversations ?? [],
    messages: messages ?? [],
    ...extra,
  }

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="mes-donnees.json"',
    },
  })
}
