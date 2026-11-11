/**
 * AKASHA AI — Karma Split dispatcher V4.1
 *
 * Existing economic calculation and RPC are preserved. This helper reports
 * every failed or inconsistent database result to the common webhook journal.
 * A successful receipt does not qualify the separate financial policy.
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
): Promise<string> {
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
    .single();
  if (res.error || typeof res.data?.id !== 'string' || res.data.id.length === 0) {
    throw new Error('Karma skip record was not confirmed');
  }
  return res.data.id;
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
  const amountCents = invoice.amount_paid;

  try {
    if (!invoiceId || !Number.isSafeInteger(amountCents) || amountCents < 0 || invoice.currency !== 'eur') {
      return { ok: false, status: 'failed', error: 'Invalid invoice amount, currency or reference' };
    }

    if (amountCents === 0) {
      const breakdown = computeKarmaSplit(0);
      const logId = await writeSkipLog(db, {
        stripe_invoice_id: invoiceId,
        stripe_customer_id: stripeCustomerId,
        user_id: userId,
        breakdown,
        skip_reason: 'zero_amount',
      });
      return {
        ok: true, status: 'skipped', skipReason: 'zero_amount', logId, breakdown,
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
      // The event journal owns failure evidence. Do not fabricate another
      // economic invoice identifier or a second best-effort financial write.
      return { ok: false, status: 'failed', error: 'Karma RPC failed', breakdown };
    }

    const row = Array.isArray(rpcRes.data)
      ? (rpcRes.data.length === 1 ? rpcRes.data[0] : null) : rpcRes.data;
    if (!row || typeof row.log_id !== 'string' || row.log_id.length === 0
        || typeof row.already_processed !== 'boolean'
        || !Array.isArray(row.pool_tx_ids)
        || row.pool_tx_ids.some((id: unknown) => typeof id !== 'string' || id.length === 0)
        || row.pool_tx_ids.length !== (row.already_processed ? 0 : 4)) {
      return { ok: false, status: 'failed', error: 'Karma receipt is inconsistent', breakdown };
    }
    if (row.already_processed) {
      // The legacy RPC only proves that some invoice log exists; it does not
      // verify that row's app/status or the four pool effects. Do not promote
      // that ambiguous history to completed for a new webhook event.
      return {
        ok: false, status: 'failed', error: 'Existing Karma history requires reconciliation',
        logId: row.log_id, breakdown,
      };
    }
    return {
      ok: true, status: 'ok', logId: row.log_id,
      poolTxIds: row.pool_tx_ids as string[], breakdown,
    };
  } catch {
    return { ok: false, status: 'failed', error: 'Karma effect was not confirmed' };
  }
}
