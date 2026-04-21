// =============================================================================
// AKASHA AI — GET /api/wallet/balance (V4.1)
// Lit le wallet_balance akasha_ai.profiles via RPC SECURITY DEFINER (schéma
// akasha_ai non-exposé via REST direct).
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const publicService = createPublicServiceClient();
    const { data, error } = await publicService.rpc('get_wallet_balance_akasha', {
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json(
        { error: `Lecture solde impossible : ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user_id: user.id,
      balance_eur: Number(data ?? 0),
      currency: 'eur',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur récupération solde';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function POST() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
