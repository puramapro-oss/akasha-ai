/**
 * AKASHA AI — Types Karma Split V4.1
 *
 * Split automatique des abos Stripe (invoice.paid) — split canonique gravé
 * 50/30/20 (FACTS.md §Revenus & répartition, source unique) : reward
 * (membres) 50% · asso (pool affiliés-parrains — nom de colonne/enum DB
 * historique conservé, 0% part association automatique) 30% · sasu 20%.
 * Le pool `adya` (V4.1 obsolète) reste neutralisé à 0% mais gardé dans le
 * type et la RPC pour ne pas casser la colonne/le contrat existants.
 * ⚠️ Renommer proprement la colonne/enum `asso`→`pool` (migration DB dédiée,
 * RPC `karma_split_apply_akasha`, `karma_split_log.split_asso_eur`) est HORS
 * SCOPE de ce fix — seuls les montants réels changent ici, pas les noms.
 *
 * Voir migrations/v4.1-akasha-pools.sql + STRIPE_CONNECT_KARMA_V4.md.
 */

export type KarmaPoolType = 'reward' | 'asso' | 'partner' | 'adya' | 'sasu';
export type KarmaSplitPool = 'reward' | 'adya' | 'asso' | 'sasu';

export const KARMA_SPLIT_RATES: Record<KarmaSplitPool, number> = {
  reward: 0.5,
  adya: 0,
  asso: 0.3,
  sasu: 0.2,
};

export interface KarmaSplitBreakdown {
  reward_eur: number;
  adya_eur: number;
  asso_eur: number;
  sasu_eur: number;
  total_eur: number;
}

export type KarmaSplitSkipReason =
  | 'no_invoice_id'
  | 'no_amount_paid'
  | 'zero_amount'
  | 'already_processed';

export type KarmaSplitStatus = 'ok' | 'skipped' | 'failed';

export interface KarmaSplitResult {
  ok: boolean;
  status: KarmaSplitStatus;
  skipReason?: KarmaSplitSkipReason;
  error?: string;
  logId?: string;
  poolTxIds?: string[];
  breakdown?: KarmaSplitBreakdown;
}

export interface KarmaSplitLog {
  id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  user_id: string | null;
  app_id: string;
  amount_eur_gross: number;
  split_reward_eur: number;
  split_adya_eur: number;
  split_asso_eur: number;
  split_sasu_eur: number;
  status: KarmaSplitStatus;
  skip_reason: KarmaSplitSkipReason | null;
  error: string | null;
  pool_tx_ids: string[];
  created_at: string;
}
