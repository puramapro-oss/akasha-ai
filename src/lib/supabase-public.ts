// =============================================================================
// AKASHA AI — Service-role client pointant sur le schéma `public` (pas akasha_ai)
// Utilisé pour lire/écrire les tables Purama partagées cross-app :
//   - public.connect_accounts (Stripe Connect Embedded)
//   - public.connect_withdrawals
//   - public.karma_split_log
//   - public.cpa_earnings
//
// Les RPCs (upsert_connect_account, karma_split_apply_akasha, etc.) vivent
// aussi dans `public` et n'ont pas de db:{schema} qui interfère.
// =============================================================================

import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

export function createPublicServiceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } },
  );
}
