-- =============================================================================
-- AKASHA AI — V4.1 Wallet RPCs (akasha_ai schema)
--
-- Trois RPCs akasha-spécifiques qui opèrent sur akasha_ai.profiles.wallet_balance
-- et n'entrent pas en conflit avec les RPCs midas existantes (noms distincts).
--
-- Réutilise :
--   - public.connect_withdrawals (partagé cross-app, stripe_transfer_id unique)
--
-- Idempotent. Appliqué via docker exec -i supabase-db psql -U supabase_admin.
-- =============================================================================

BEGIN;

-- 1. RPC debit_wallet_for_withdrawal_akasha — atomique + safe ----------------
--
-- SELECT FOR UPDATE → CHECK balance >= amount → UPDATE.
-- RAISE 'insufficient_balance' catché par l'API route pour retour 400 FR.
-- Retourne le nouveau solde pour affichage immédiat côté UI.

CREATE OR REPLACE FUNCTION public.debit_wallet_for_withdrawal_akasha(
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = akasha_ai, public, pg_temp
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount;
  END IF;

  SELECT wallet_balance INTO v_current_balance
    FROM akasha_ai.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance: current=% requested=%',
      v_current_balance, p_amount;
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE akasha_ai.profiles
     SET wallet_balance = v_new_balance,
         updated_at = now()
   WHERE id = p_user_id;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet_for_withdrawal_akasha(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal_akasha(UUID, NUMERIC) TO service_role;

-- 2. RPC credit_wallet_on_withdrawal_failure_akasha --------------------------

CREATE OR REPLACE FUNCTION public.credit_wallet_on_withdrawal_failure_akasha(
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = akasha_ai, public, pg_temp
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount;
  END IF;

  UPDATE akasha_ai.profiles
     SET wallet_balance = wallet_balance + p_amount,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING wallet_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_on_withdrawal_failure_akasha(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_on_withdrawal_failure_akasha(UUID, NUMERIC) TO service_role;

-- 3. RPC get_wallet_balance_akasha — lecture seule ---------------------------

CREATE OR REPLACE FUNCTION public.get_wallet_balance_akasha(
  p_user_id UUID
) RETURNS NUMERIC
LANGUAGE sql SECURITY DEFINER
SET search_path = akasha_ai, public, pg_temp
AS $$
  SELECT COALESCE(wallet_balance, 0)::NUMERIC
    FROM akasha_ai.profiles
   WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_balance_akasha(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance_akasha(UUID) TO service_role;

COMMIT;
