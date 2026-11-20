-- One 25-EUR prime per Checkout Session, independent of Stripe Event IDs.
-- Install before the new helper and retire legacy prime writers before rollout.
-- This migration does not reconstruct or replay ambiguous historical effects.
BEGIN;

CREATE TABLE akasha_ai.checkout_prime_j1_receipts (
  stripe_account_key text NOT NULL CHECK (length(stripe_account_key) BETWEEN 1 AND 255),
  livemode boolean NOT NULL,
  checkout_session_id text NOT NULL CHECK (length(checkout_session_id) BETWEEN 1 AND 255),
  user_id uuid REFERENCES akasha_ai.profiles(id) ON DELETE SET NULL,
  wallet_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE,
  amount numeric(10,2) NOT NULL CHECK (amount = 25.00),
  currency text NOT NULL CHECK (currency = 'eur'),
  promo_source text,
  balance_after numeric(10,2) NOT NULL,
  total_earned_after numeric(10,2) NOT NULL,
  credited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (stripe_account_key, livemode, checkout_session_id)
);

-- The receipt survives removal of a descriptive wallet transaction or wallet.
-- Account deletion detaches the beneficiary without blocking the existing
-- deletion flow. The consumed Session stays reserved; NULL cannot match any
-- new beneficiary. There is no direct receipt access, even for service_role.
ALTER TABLE akasha_ai.checkout_prime_j1_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akasha_ai.checkout_prime_j1_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION akasha_ai.credit_checkout_prime_j1(
  p_stripe_account_key text, p_livemode boolean, p_checkout_session_id text,
  p_user_id uuid, p_amount numeric, p_currency text, p_promo_source text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $credit_prime$
DECLARE
  receipt akasha_ai.checkout_prime_j1_receipts%ROWTYPE;
  wallet akasha_ai.wallets%ROWTYPE;
  transaction_id uuid;
  description text;
  credited boolean := false;
BEGIN
  IF p_stripe_account_key IS NULL OR length(p_stripe_account_key) NOT BETWEEN 1 AND 255
    OR p_livemode IS NULL OR p_checkout_session_id IS NULL
    OR length(p_checkout_session_id) NOT BETWEEN 1 AND 255 OR p_user_id IS NULL
    OR p_amount IS DISTINCT FROM 25.00 OR p_currency IS DISTINCT FROM 'eur'
  THEN
    RAISE EXCEPTION 'Invalid Checkout prime input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO receipt FROM akasha_ai.checkout_prime_j1_receipts
  WHERE stripe_account_key = p_stripe_account_key AND livemode = p_livemode
    AND checkout_session_id = p_checkout_session_id;

  IF NOT FOUND THEN
    INSERT INTO akasha_ai.wallets(user_id) VALUES (p_user_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO STRICT wallet FROM akasha_ai.wallets
      WHERE user_id = p_user_id FOR UPDATE;

    -- The wallet lock serializes different Sessions too, preventing lost credits.
    -- Re-read after waiting: an identical Session may now have a durable receipt.
    SELECT * INTO receipt FROM akasha_ai.checkout_prime_j1_receipts
    WHERE stripe_account_key = p_stripe_account_key AND livemode = p_livemode
      AND checkout_session_id = p_checkout_session_id;
    IF NOT FOUND THEN
      -- Legacy descriptions carry neither namespace nor atomic completion proof.
      -- Check every beneficiary; a changed user must not turn old ambiguity into
      -- a second credit. A literal substring treats '_' and '%' as text, not LIKE
      -- wildcards. Receipted transactions already have authoritative identities.
      IF EXISTS (
        SELECT 1 FROM akasha_ai.wallet_transactions AS old
        WHERE old.type = 'prime_j1'
          AND strpos(lower(coalesce(old.description, '')), lower(p_checkout_session_id)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM akasha_ai.checkout_prime_j1_receipts AS known
            WHERE known.transaction_id = old.id
          )
      ) THEN
        RAISE EXCEPTION 'Legacy Checkout prime requires reconciliation' USING ERRCODE = '55000';
      END IF;
      IF wallet.balance IS NULL OR wallet.total_earned IS NULL
        OR wallet.balance::text IN ('NaN', 'Infinity', '-Infinity')
        OR wallet.total_earned::text IN ('NaN', 'Infinity', '-Infinity')
      THEN
        RAISE EXCEPTION 'Wallet balance is not confirmed' USING ERRCODE = '22023';
      END IF;

      description := CASE WHEN p_promo_source IS NOT NULL AND p_promo_source <> ''
        THEN 'Prime J+1 Purama — cross-promo ' || p_promo_source || ' (session ' || p_checkout_session_id || ')'
        ELSE 'Prime J+1 Purama (session ' || p_checkout_session_id || ')' END;
      INSERT INTO akasha_ai.wallet_transactions(wallet_id, amount, type, description)
        VALUES (wallet.id, p_amount, 'prime_j1', description)
        RETURNING id INTO transaction_id;
      UPDATE akasha_ai.wallets
        SET balance = balance + p_amount, total_earned = total_earned + p_amount
        WHERE id = wallet.id RETURNING * INTO STRICT wallet;

      -- A conflicting Session/beneficiary that raced on another wallet causes
      -- this unique INSERT to fail, rolling back ALL financial writes above.
      INSERT INTO akasha_ai.checkout_prime_j1_receipts (
        stripe_account_key, livemode, checkout_session_id, user_id, wallet_id,
        transaction_id, amount, currency, promo_source, balance_after, total_earned_after
      ) VALUES (
        p_stripe_account_key, p_livemode, p_checkout_session_id, p_user_id, wallet.id,
        transaction_id, p_amount, p_currency, p_promo_source, wallet.balance, wallet.total_earned
      ) RETURNING * INTO receipt;
      credited := true;
    END IF;
  END IF;

  IF receipt.user_id IS DISTINCT FROM p_user_id OR receipt.amount IS DISTINCT FROM p_amount
    OR receipt.currency IS DISTINCT FROM p_currency OR receipt.promo_source IS DISTINCT FROM p_promo_source
  THEN
    RAISE EXCEPTION 'Conflicting Checkout prime evidence' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'version', 1, 'status', CASE WHEN credited THEN 'credited' ELSE 'already_credited' END,
    'stripe_account_key', receipt.stripe_account_key, 'livemode', receipt.livemode,
    'checkout_session_id', receipt.checkout_session_id, 'user_id', receipt.user_id,
    'wallet_id', receipt.wallet_id, 'transaction_id', receipt.transaction_id,
    'amount', receipt.amount, 'currency', receipt.currency, 'promo_source', receipt.promo_source,
    'balance_after', receipt.balance_after, 'total_earned_after', receipt.total_earned_after
  );
END
$credit_prime$;

REVOKE ALL ON FUNCTION akasha_ai.credit_checkout_prime_j1(text, boolean, text, uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.credit_checkout_prime_j1(text, boolean, text, uuid, numeric, text, text)
  TO service_role;
COMMENT ON TABLE akasha_ai.checkout_prime_j1_receipts IS
  'Atomic 25-EUR Checkout prime receipts. Identity is account/mode/Session, not Event ID. Legacy unreceipted effects require reconciliation; no backfill or replay.';
COMMIT;
