// =============================================================================
// AKASHA AI — POST /api/connect/onboard (V4.1)
// Crée (ou retourne) le compte Stripe Connect Express de l'user authentifié.
// Idempotent. Voir STRIPE_CONNECT_KARMA_V4.md §Stripe Connect.
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';
import { ensureConnectAccount, getConnectAccountRow } from '@/lib/stripe/connect';
import type { ConnectOnboardResponse } from '@/types/stripe';

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

    // Service client sur public pour toutes les opérations Connect.
    const publicService = createPublicServiceClient();

    const existing = await getConnectAccountRow(publicService, user.id);
    if (existing) {
      const response: ConnectOnboardResponse = {
        stripe_account_id: existing.stripe_account_id,
        onboarding_completed: existing.onboarding_completed,
        details_submitted: existing.details_submitted,
        payouts_enabled: existing.payouts_enabled,
      };
      return NextResponse.json(response);
    }

    // Email depuis akasha_ai.profiles (source de vérité).
    const { data: profile, error: profileErr } = await authClient
      .from('profiles')
      .select('id, email')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
    }

    const email = (profile as { email?: string | null }).email ?? user.email;
    if (!email) {
      return NextResponse.json(
        { error: 'Email utilisateur manquant — impossible de créer le compte Connect' },
        { status: 400 },
      );
    }

    const account = await ensureConnectAccount(publicService, {
      userId: user.id,
      email,
    });

    const response: ConnectOnboardResponse = {
      stripe_account_id: account.stripe_account_id,
      onboarding_completed: account.onboarding_completed,
      details_submitted: account.details_submitted,
      payouts_enabled: account.payouts_enabled,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur interne lors de l'onboarding Connect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}

export function PUT() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}

export function DELETE() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
