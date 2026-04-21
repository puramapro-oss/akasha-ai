// =============================================================================
// AKASHA AI — GET /api/connect/status (V4.1)
// Retourne le résumé Connect de l'user authentifié. Refetch Stripe si non
// verified pour avoir les requirements à jour (currently_due / past_due).
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';
import { getConnectAccountSummary } from '@/lib/stripe/connect';

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
    const summary = await getConnectAccountSummary(publicService, user.id);
    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur récupération statut Connect';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function POST() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
