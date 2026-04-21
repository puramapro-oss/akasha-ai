// =============================================================================
// AKASHA AI — POST /api/insee/verify (V7.1 §36.1)
// Vérification SIRET live INSEE Sirene V3.11.
// Auth-gated : seul un user connecté peut déclencher un hit INSEE (rate-limit
// naturel via Supabase sessions, anti-abus API).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { verifySiret } from '@/lib/insee/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  siret: z
    .string()
    .min(14, 'Le SIRET doit contenir 14 chiffres')
    .max(20, 'SIRET trop long')
    .transform((s) => s.replace(/\s/g, '')),
});

export async function POST(req: NextRequest) {
  try {
    // Auth
    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Validate body
    let siret: string;
    try {
      const raw: unknown = await req.json();
      siret = bodySchema.parse(raw).siret;
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Format invalide', details: e.issues },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: 'JSON invalide' },
        { status: 400 },
      );
    }

    // Verify live
    const result = await verifySiret(siret);
    if (!result.valid) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur vérification SIRET';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
