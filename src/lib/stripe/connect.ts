// =============================================================================
// AKASHA AI — Stripe Connect Express (Embedded Components) V4.1
// Helpers serveur : création compte, AccountSession, sync DB, projection UI.
// Utilise STRIPE_SECRET_KEY (pas de STRIPE_CONNECT_CLIENT_ID — Embedded
// Components ne passent pas par OAuth). Voir STRIPE_CONNECT_KARMA_V4.md.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import type {
  ConnectAccount,
  ConnectAccountSummary,
  ConnectOnboardingStage,
  ConnectAccountSessionResponse,
} from '@/types/stripe';

const CONNECT_TABLE = 'connect_accounts';

let stripeSingleton: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY manquant');
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

// --- Création / récupération du compte Connect Express ---------------------

export interface EnsureConnectAccountInput {
  userId: string;
  email: string;
  country?: string;
  defaultCurrency?: string;
  metadata?: Record<string, string>;
}

export async function ensureConnectAccount(
  supabase: SupabaseClient,
  input: EnsureConnectAccountInput,
): Promise<ConnectAccount> {
  const existing = await getConnectAccountRow(supabase, input.userId);
  if (existing) return existing;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    email: input.email,
    country: input.country ?? 'FR',
    default_currency: input.defaultCurrency ?? 'eur',
    capabilities: {
      transfers: { requested: true },
    },
    controller: {
      fees: { payer: 'account' },
      losses: { payments: 'application' },
      stripe_dashboard: { type: 'none' },
      requirement_collection: 'application',
    },
    metadata: {
      user_id: input.userId,
      app: 'akasha_ai',
      ...(input.metadata ?? {}),
    },
  });

  const row = await syncConnectAccount(supabase, input.userId, account);
  return row;
}

// --- Account Session pour Embedded Components -----------------------------

export async function createConnectAccountSession(
  stripeAccountId: string,
): Promise<ConnectAccountSessionResponse> {
  const stripe = getStripe();
  const session = await stripe.accountSessions.create({
    account: stripeAccountId,
    components: {
      account_onboarding: { enabled: true },
      account_management: { enabled: true },
      notification_banner: { enabled: true },
      payouts: { enabled: true },
      payments: { enabled: true },
      balances: { enabled: true },
      documents: { enabled: true },
    },
  });

  return {
    client_secret: session.client_secret,
    expires_at: session.expires_at,
    stripe_account_id: stripeAccountId,
  };
}

// --- Synchronisation DB ↔ Stripe ------------------------------------------

export async function syncConnectAccount(
  supabase: SupabaseClient,
  userId: string,
  account: Stripe.Account,
): Promise<ConnectAccount> {
  const { data, error } = await supabase.rpc('upsert_connect_account', {
    p_user_id: userId,
    p_stripe_account_id: account.id,
    p_details_submitted: account.details_submitted ?? false,
    p_charges_enabled: account.charges_enabled ?? false,
    p_payouts_enabled: account.payouts_enabled ?? false,
    p_disabled_reason: account.requirements?.disabled_reason ?? null,
    p_capabilities: (account.capabilities ?? {}) as Record<string, unknown>,
    p_requirements: (account.requirements ?? {}) as unknown as Record<string, unknown>,
    p_country: account.country ?? 'FR',
    p_default_currency: account.default_currency ?? 'eur',
  });

  if (error) {
    throw new Error(`Sync Connect DB impossible : ${error.message}`);
  }
  if (!data) {
    throw new Error('Sync Connect : aucune ligne retournée');
  }

  return data as ConnectAccount;
}

export async function getConnectAccountRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectAccount | null> {
  const { data, error } = await supabase
    .from(CONNECT_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Lecture connect_accounts impossible : ${error.message}`);
  }
  return (data as ConnectAccount | null) ?? null;
}

export async function getConnectAccountSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectAccountSummary> {
  const row = await getConnectAccountRow(supabase, userId);

  if (!row) {
    return {
      has_account: false,
      stripe_account_id: null,
      onboarding_stage: 'not_started',
      payouts_enabled: false,
      charges_enabled: false,
      disabled_reason: null,
      kyc_verified_at: null,
      country: 'FR',
      default_currency: 'eur',
      currently_due: [],
      past_due: [],
    };
  }

  let synced: ConnectAccount = row;
  const needsRefresh = !row.payouts_enabled || !row.onboarding_completed;
  if (needsRefresh) {
    const stripe = getStripe();
    const freshAccount = await stripe.accounts.retrieve(row.stripe_account_id);
    synced = await syncConnectAccount(supabase, userId, freshAccount);
  }

  const requirements = (synced.requirements ?? {}) as {
    currently_due?: string[];
    past_due?: string[];
  };

  return {
    has_account: true,
    stripe_account_id: synced.stripe_account_id,
    onboarding_stage: deriveOnboardingStage(synced, requirements),
    payouts_enabled: synced.payouts_enabled,
    charges_enabled: synced.charges_enabled,
    disabled_reason: synced.disabled_reason,
    kyc_verified_at: synced.kyc_verified_at,
    country: synced.country,
    default_currency: synced.default_currency,
    currently_due: requirements.currently_due ?? [],
    past_due: requirements.past_due ?? [],
  };
}

export function deriveOnboardingStage(
  account: Pick<ConnectAccount, 'onboarding_completed' | 'payouts_enabled' | 'details_submitted'>,
  requirements: { currently_due?: string[]; past_due?: string[] },
): ConnectOnboardingStage {
  if (account.onboarding_completed && account.payouts_enabled) return 'verified';
  if ((requirements.past_due ?? []).length > 0) return 'requirements_due';
  if ((requirements.currently_due ?? []).length > 0) return 'requirements_due';
  if (account.details_submitted) return 'in_progress';
  return 'not_started';
}

export { getStripe };
