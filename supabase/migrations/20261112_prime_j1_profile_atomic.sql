-- Additive version 20261112 follows both published 20261111 migrations.
-- Drain/retire old split profile+prime writers BEFORE applying this migration:
-- their old financial RPC loses service_role access; no mixed rollout is safe.
-- This transaction covers profile + prime only, not the event journal/cross-promo.
BEGIN;

DO $prerequisite$
BEGIN
  IF to_regclass('akasha_ai.checkout_prime_j1_receipts') IS NULL
    OR to_regprocedure('akasha_ai.credit_checkout_prime_j1(text,boolean,text,uuid,numeric,text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'Install the atomic prime migration before profile completion' USING ERRCODE = '55000';
  END IF;
END
$prerequisite$;

-- Old receipts stay NULL and ambiguous. Never reconstruct a profile intention
-- from its current state: a later subscription may legitimately have changed it.
ALTER TABLE akasha_ai.checkout_prime_j1_receipts
  ADD COLUMN profile_intent_v1_sha256 bytea
  CHECK (profile_intent_v1_sha256 IS NULL OR octet_length(profile_intent_v1_sha256) = 32);

CREATE FUNCTION akasha_ai.complete_checkout_prime_j1(
  p_stripe_account_key text, p_livemode boolean, p_checkout_session_id text,
  p_user_id uuid, p_amount numeric, p_currency text, p_promo_source text,
  p_customer_id text, p_subscription_id text, p_plan text, p_plan_tier text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $complete_prime$
DECLARE
  financial_receipt jsonb;
  receipt akasha_ai.checkout_prime_j1_receipts%ROWTYPE;
  profile akasha_ai.profiles%ROWTYPE;
  intent_sha256 bytea;
  started_at timestamptz;
BEGIN
  IF p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 1 AND 255
    OR p_subscription_id IS NULL OR length(p_subscription_id) NOT BETWEEN 1 AND 255
    OR (p_plan IS NULL) <> (p_plan_tier IS NULL) OR p_plan = '' OR p_plan_tier = ''
  THEN
    RAISE EXCEPTION 'Invalid Checkout profile intention' USING ERRCODE = '22023';
  END IF;

  -- Canonical v1 tuple: customer, subscription, nullable plan, nullable tier.
  -- String => UTF-8 byte length + ':' + value + ';'; NULL => 'n;'. No timestamp.
  intent_sha256 := sha256(convert_to('akasha-checkout-profile-v1;'
    || octet_length(convert_to(p_customer_id, 'UTF8'))::text || ':' || p_customer_id || ';'
    || octet_length(convert_to(p_subscription_id, 'UTF8'))::text || ':' || p_subscription_id || ';'
    || CASE WHEN p_plan IS NULL THEN 'n;'
      ELSE octet_length(convert_to(p_plan, 'UTF8'))::text || ':' || p_plan || ';' END
    || CASE WHEN p_plan_tier IS NULL THEN 'n;'
      ELSE octet_length(convert_to(p_plan_tier, 'UTF8'))::text || ':' || p_plan_tier || ';' END, 'UTF8'));

  -- Serialize a beneficiary's completions before taking the wallet lock.
  -- The profile must exist; deletion keeps the receipt's nullable-user tombstone.
  SELECT * INTO STRICT profile FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  financial_receipt := akasha_ai.credit_checkout_prime_j1(
    p_stripe_account_key, p_livemode, p_checkout_session_id, p_user_id,
    p_amount, p_currency, p_promo_source);
  SELECT * INTO STRICT receipt FROM akasha_ai.checkout_prime_j1_receipts
    WHERE stripe_account_key = p_stripe_account_key AND livemode = p_livemode
      AND checkout_session_id = p_checkout_session_id;

  IF financial_receipt->>'status' = 'already_credited' THEN
    IF receipt.profile_intent_v1_sha256 IS NULL THEN
      RAISE EXCEPTION 'Historical Checkout profile requires reconciliation' USING ERRCODE = '55000';
    END IF;
    IF receipt.profile_intent_v1_sha256 IS DISTINCT FROM intent_sha256 THEN
      RAISE EXCEPTION 'Conflicting Checkout profile intention' USING ERRCODE = '22023';
    END IF;
    -- A valid replay must never reset a newer subscription or its start time.
  ELSIF financial_receipt->>'status' = 'credited' THEN
    started_at := clock_timestamp();
    IF p_plan IS NULL THEN
      UPDATE akasha_ai.profiles SET stripe_customer_id = p_customer_id,
        stripe_subscription_id = p_subscription_id, subscription_started_at = started_at
        WHERE id = p_user_id RETURNING * INTO STRICT profile;
    ELSE
      UPDATE akasha_ai.profiles SET stripe_customer_id = p_customer_id,
        stripe_subscription_id = p_subscription_id, subscription_started_at = started_at,
        plan = p_plan, plan_tier = p_plan_tier
        WHERE id = p_user_id RETURNING * INTO STRICT profile;
    END IF;
    IF profile.stripe_customer_id IS DISTINCT FROM p_customer_id
      OR profile.stripe_subscription_id IS DISTINCT FROM p_subscription_id
      OR profile.subscription_started_at IS DISTINCT FROM started_at
      OR (p_plan IS NOT NULL AND (profile.plan IS DISTINCT FROM p_plan
        OR profile.plan_tier IS DISTINCT FROM p_plan_tier))
    THEN
      RAISE EXCEPTION 'Checkout profile update was not confirmed' USING ERRCODE = '55000';
    END IF;
    UPDATE akasha_ai.checkout_prime_j1_receipts SET profile_intent_v1_sha256 = intent_sha256
      WHERE stripe_account_key = p_stripe_account_key AND livemode = p_livemode
        AND checkout_session_id = p_checkout_session_id AND user_id = p_user_id
        AND profile_intent_v1_sha256 IS NULL RETURNING * INTO STRICT receipt;
    IF receipt.profile_intent_v1_sha256 IS DISTINCT FROM intent_sha256 THEN
      RAISE EXCEPTION 'Checkout profile receipt was not confirmed' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'Checkout prime completion was not confirmed' USING ERRCODE = '55000';
  END IF;

  RETURN financial_receipt || jsonb_build_object('profile_intent_version', 1,
    'profile_intent_sha256', encode(receipt.profile_intent_v1_sha256, 'hex'));
END
$complete_prime$;

-- The owner keeps the old function for this SECURITY DEFINER composition.
-- Application roles cannot bypass profile completion through the old signature.
REVOKE ALL ON FUNCTION akasha_ai.credit_checkout_prime_j1(text, boolean, text, uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION akasha_ai.complete_checkout_prime_j1(text, boolean, text, uuid, numeric, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.complete_checkout_prime_j1(text, boolean, text, uuid, numeric, text, text, text, text, text, text)
  TO service_role;
COMMENT ON COLUMN akasha_ai.checkout_prime_j1_receipts.profile_intent_v1_sha256 IS
  'SHA-256 of the versioned UTF-8 length-framed profile write intention. NULL means historical ambiguity. No delivery time or duplicated Stripe IDs. Retained with the consumed Session after user deletion.';
COMMIT;
