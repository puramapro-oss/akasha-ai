-- T4 Claude — 2026-09-26
-- Idempotence webhook Stripe : Stripe garantit une livraison "at-least-once", un même
-- event.id peut être rejoué. Sans garde, checkout.session.completed/invoice.paid
-- double-créditent primes/wallets/karma split à chaque rejeu. Table de claim-first :
-- un INSERT réussi = premier traitement, une violation de contrainte unique = rejeu déjà
-- traité (skip). Pattern identique à bala/supabase/migrations/004_stripe_events_processed.sql
-- et vida/migrations/017_stripe_events_processed.sql.
CREATE TABLE IF NOT EXISTS akasha_ai.stripe_events_processed (
  event_id text PRIMARY KEY,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE akasha_ai.stripe_events_processed ENABLE ROW LEVEL SECURITY;

-- Aucun accès direct : uniquement le service role (webhook route, clé service).
DROP POLICY IF EXISTS "service_role_only" ON akasha_ai.stripe_events_processed;
CREATE POLICY "service_role_only" ON akasha_ai.stripe_events_processed
  FOR ALL
  USING (false)
  WITH CHECK (false);
