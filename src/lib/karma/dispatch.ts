/**
 * AKASHA AI — Karma Split dispatcher V4.1
 *
 * Orchestrateur appelé par le webhook Stripe `invoice.paid`. Calcule le split
 * 50/10/10/30 et applique atomiquement les 4 increments de pools via la RPC
 * `public.karma_split_apply_akasha` (écrit dans akasha_ai.pool_balances).
 *
 * Contrat :
 *  - Ne throw JAMAIS (webhook doit retourner 200 à Stripe).
 *  - Idempotent via UNIQUE(stripe_invoice_id) sur public.karma_split_log.
 *  - Atomique : 4 pools crédités ou aucun (plpgsql RAISE).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { computeKarmaSplit } from './split';
import type {
  KarmaSplitBreakdown,
  KarmaSplitResult,
  KarmaSplitSkipReason,
} from '@/types/karma';

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } },
  );
}

function extractUserId(invoice: Stripe.Invoice): string | null {
  type WithMetadata = { metadata?: Record<string, string> | null };
  type InvoiceWithDetails = Stripe.Invoice & {
    subscription_details?: WithMetadata | null;
    subscription?: string | (Stripe.Subscription & WithMetadata) | null;
  };

  const inv = invoice as InvoiceWithDetails;
  const fromDetails = inv.subscription_details?.metadata?.user_id ?? null;
  const fromInvoice = inv.metadata?.user_id ?? null;
  const fromSub =
    typeof inv.subscription === 'object' && inv.subscription !== null
      ? inv.subscription.metadata?.user_id ?? null
      : null;

  return fromDetails ?? fromInvoice ?? fromSub ?? null;
}

async function writeSkipLog(
  db: SupabaseClient,
  row: {
    stripe_invoice_id: string;
    stripe_customer_id: string | null;
    user_id: string | null;
    breakdown: KarmaSplitBreakdown;
    skip_reason: KarmaSplitSkipReason;
  },
): Promise<string | undefined> {
  try {
    const res = await db
      .from('karma_split_log')
      .insert({
        stripe_invoice_id: row.stripe_invoice_id,
        stripe_customer_id: row.stripe_customer_id,
        user_id: row.user_id,
        app_id: 'akasha_ai',
        amount_eur_gross: row.breakdown.total_eur,
        split_reward_eur: row.breakdown.reward_eur,
        split_adya_eur: row.breakdown.adya_eur,
        split_asso_eur: row.breakdown.asso_eur,
        split_sasu_eur: row.breakdown.sasu_eur,
        status: 'skipped',
        skip_reason: row.skip_reason,
      })
      .select('id')
      .maybeSingle();
    return res.data?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function dispatchKarmaSplit(
  invoice: Stripe.Invoice,
  supabase?: SupabaseClient,
): Promise<KarmaSplitResult> {
  const db = supabase ?? getAdminClient();

  const invoiceId = invoice.id ?? '';
  const stripeCustomerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null;
  const userId = extractUserId(invoice);
  const amountCents = invoice.amount_paid ?? 0;

  try {
    if (!invoiceId) {
      return {
        ok: true,
        status: 'skipped',
        skipReason: 'no_invoice_id',
      };
    }

    if (!amountCents || amountCents <= 0) {
      const breakdown = computeKarmaSplit(0);
      const logId = await writeSkipLog(db, {
        stripe_invoice_id: invoiceId,
        stripe_customer_id: stripeCustomerId,
        user_id: userId,
        breakdown,
        skip_reason: 'zero_amount',
      });
      return {
        ok: true,
        status: 'skipped',
        skipReason: 'zero_amount',
        logId,
        breakdown,
      };
    }

    const breakdown = computeKarmaSplit(amountCents);

    const rpcRes = await db.rpc('karma_split_apply_akasha', {
      p_stripe_invoice_id: invoiceId,
      p_stripe_customer_id: stripeCustomerId,
      p_user_id: userId,
      p_amount_eur_gross: breakdown.total_eur,
      p_split_reward_eur: breakdown.reward_eur,
      p_split_adya_eur: breakdown.adya_eur,
      p_split_asso_eur: breakdown.asso_eur,
      p_split_sasu_eur: breakdown.sasu_eur,
    });

    if (rpcRes.error) {
      try {
        await db
          .from('karma_split_log')
          .insert({
            stripe_invoice_id: `failed_${invoiceId}_${Date.now()}`,
            stripe_customer_id: stripeCustomerId,
            user_id: userId,
            app_id: 'akasha_ai',
            amount_eur_gross: breakdown.total_eur,
            split_reward_eur: breakdown.reward_eur,
            split_adya_eur: breakdown.adya_eur,
            split_asso_eur: breakdown.asso_eur,
            split_sasu_eur: breakdown.sasu_eur,
            status: 'failed',
            error: rpcRes.error.message,
          });
      } catch {
        /* best-effort */
      }
      return {
        ok: false,
        status: 'failed',
        error: rpcRes.error.message,
        breakdown,
      };
    }

    const row = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data;
    const alreadyProcessed: boolean = row?.already_processed ?? false;

    if (alreadyProcessed) {
      return {
        ok: true,
        status: 'skipped',
        skipReason: 'already_processed',
        logId: row?.log_id,
        breakdown,
      };
    }

    return {
      ok: true,
      status: 'ok',
      logId: row?.log_id,
      poolTxIds: (row?.pool_tx_ids ?? []) as string[],
      breakdown,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return {
      ok: false,
      status: 'failed',
      error: msg,
    };
  }
}
