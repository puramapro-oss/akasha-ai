// =============================================================================
// AKASHA AI — POST /api/connect/account-session (V4.1)
// Retourne un client_secret pour initialiser ConnectComponentsProvider côté
// client. Expire après 30 min (Stripe). User doit avoir un compte Connect.
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';
import {
  createConnectAccountSession,
  getConnectAccountRow,
} from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const publicService = createPublicServiceClient();
    const row = await getConnectAccountRow(publicService, user.id);
    if (!row) {
      return NextResponse.json(
        { error: 'Compte Connect inexistant — appelle /api/connect/onboard d\'abord' },
        { status: 404 },
      );
    }

    const session = await createConnectAccountSession(row.stripe_account_id);
    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur création AccountSession';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
