-- =============================================================================
-- AKASHA AI — V4.1 Karma Split 50/10/10/30 (akasha_ai schema)
--
-- Tables akasha_ai.pool_balances + akasha_ai.pool_transactions (mirror midas).
-- RPC public.karma_split_apply_akasha atomique (log public + 4 pools akasha_ai).
--
-- Réutilise :
--   - public.karma_split_log (partagé cross-app, idempotent par stripe_invoice_id)
--   - public.cpa_earnings (partagé cross-app)
--
-- Idempotent. Appliqué via docker exec -i supabase-db psql -U supabase_admin.
-- =============================================================================

BEGIN;

-- 1. Extension karma_split_log : app_id pour tracking multi-app ---------------

ALTER TABLE public.karma_split_log
  ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'midas';

CREATE INDEX IF NOT EXISTS idx_karma_split_log_app_id
  ON public.karma_split_log(app_id);

-- 2. akasha_ai.pool_balances --------------------------------------------------

CREATE TABLE IF NOT EXISTS akasha_ai.pool_balances (
  pool_type TEXT PRIMARY KEY
    CHECK (pool_type IN ('reward', 'asso', 'partner', 'adya', 'sasu')),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_in NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_out NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO akasha_ai.pool_balances (pool_type)
  VALUES ('reward'), ('asso'), ('partner'), ('adya'), ('sasu')
  ON CONFLICT (pool_type) DO NOTHING;

ALTER TABLE akasha_ai.pool_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS akasha_pool_balances_service_all ON akasha_ai.pool_balances;
CREATE POLICY akasha_pool_balances_service_all ON akasha_ai.pool_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. akasha_ai.pool_transactions ----------------------------------------------

CREATE TABLE IF NOT EXISTS akasha_ai.pool_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type TEXT NOT NULL
    CHECK (pool_type IN ('reward', 'asso', 'partner', 'adya', 'sasu')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  reason TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akasha_pool_tx_pool_type
  ON akasha_ai.pool_transactions(pool_type);
CREATE INDEX IF NOT EXISTS idx_akasha_pool_tx_reference
  ON akasha_ai.pool_transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_akasha_pool_tx_created
  ON akasha_ai.pool_transactions(created_at DESC);

ALTER TABLE akasha_ai.pool_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS akasha_pool_tx_service_all ON akasha_ai.pool_transactions;
CREATE POLICY akasha_pool_tx_service_all ON akasha_ai.pool_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. RPC akasha_ai increment pool balance -------------------------------------

CREATE OR REPLACE FUNCTION public.increment_pool_balance_akasha(
  p_pool_type TEXT,
  p_amount NUMERIC,
  p_direction TEXT,
  p_reason TEXT,
  p_reference_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = akasha_ai, public, pg_temp
AS $$
DECLARE
  v_tx_id UUID;
BEGIN
  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'invalid direction: %', p_direction;
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid amount: %', p_amount;
  END IF;

  IF p_direction = 'in' THEN
    UPDATE akasha_ai.pool_balances
       SET balance    = balance + p_amount,
           total_in   = total_in + p_amount,
           updated_at = now()
     WHERE pool_type = p_pool_type;
  ELSE
    UPDATE akasha_ai.pool_balances
       SET balance    = balance - p_amount,
           total_out  = total_out + p_amount,
           updated_at = now()
     WHERE pool_type = p_pool_type;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown pool_type: %', p_pool_type;
  END IF;

  INSERT INTO akasha_ai.pool_transactions (pool_type, amount, direction, reason, reference_id)
  VALUES (p_pool_type, p_amount, p_direction, p_reason, p_reference_id)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_pool_balance_akasha(TEXT, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_pool_balance_akasha(TEXT, NUMERIC, TEXT, TEXT, UUID) TO service_role;

-- 5. RPC karma_split_apply_akasha — atomique, idempotent ---------------------

CREATE OR REPLACE FUNCTION public.karma_split_apply_akasha(
  p_stripe_invoice_id TEXT,
  p_stripe_customer_id TEXT,
  p_user_id UUID,
  p_amount_eur_gross NUMERIC,
  p_split_reward_eur NUMERIC,
  p_split_adya_eur NUMERIC,
  p_split_asso_eur NUMERIC,
  p_split_sasu_eur NUMERIC
) RETURNS TABLE(log_id UUID, pool_tx_ids UUID[], already_processed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = akasha_ai, public, pg_temp
AS $$
DECLARE
  v_existing_log_id UUID;
  v_log_id UUID;
  v_tx_ids UUID[] := ARRAY[]::UUID[];
  v_tx UUID;
BEGIN
  -- Fast path idempotence
  SELECT id INTO v_existing_log_id
    FROM public.karma_split_log
   WHERE stripe_invoice_id = p_stripe_invoice_id;

  IF v_existing_log_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_log_id, ARRAY[]::UUID[], true;
    RETURN;
  END IF;

  -- Insert log (app_id='akasha_ai') atomically, fallback on race
  BEGIN
    INSERT INTO public.karma_split_log (
      stripe_invoice_id, stripe_customer_id, user_id, app_id,
      amount_eur_gross, split_reward_eur, split_adya_eur,
      split_asso_eur, split_sasu_eur, status
    ) VALUES (
      p_stripe_invoice_id, p_stripe_customer_id, p_user_id, 'akasha_ai',
      p_amount_eur_gross, p_split_reward_eur, p_split_adya_eur,
      p_split_asso_eur, p_split_sasu_eur, 'ok'
    )
    RETURNING id INTO v_log_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_log_id
      FROM public.karma_split_log
     WHERE stripe_invoice_id = p_stripe_invoice_id;
    RETURN QUERY SELECT v_log_id, ARRAY[]::UUID[], true;
    RETURN;
  END;

  -- 4 increments vers akasha_ai.pool_balances — RAISE rollback l'ensemble
  v_tx := public.increment_pool_balance_akasha('reward', p_split_reward_eur, 'in', 'karma_split', v_log_id);
  v_tx_ids := array_append(v_tx_ids, v_tx);
  v_tx := public.increment_pool_balance_akasha('adya', p_split_adya_eur, 'in', 'karma_split', v_log_id);
  v_tx_ids := array_append(v_tx_ids, v_tx);
  v_tx := public.increment_pool_balance_akasha('asso', p_split_asso_eur, 'in', 'karma_split', v_log_id);
  v_tx_ids := array_append(v_tx_ids, v_tx);
  v_tx := public.increment_pool_balance_akasha('sasu', p_split_sasu_eur, 'in', 'karma_split', v_log_id);
  v_tx_ids := array_append(v_tx_ids, v_tx);

  UPDATE public.karma_split_log
     SET pool_tx_ids = v_tx_ids
   WHERE id = v_log_id;

  RETURN QUERY SELECT v_log_id, v_tx_ids, false;
END;
$$;

REVOKE ALL ON FUNCTION public.karma_split_apply_akasha(TEXT, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.karma_split_apply_akasha(TEXT, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO service_role;

COMMIT;
