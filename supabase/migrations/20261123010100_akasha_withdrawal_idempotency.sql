-- AKASHA withdrawal requests. No historical wallet RPC, prime or ledger is changed.
-- Requires the versioned public.connect_withdrawals contract from MIDAS:
-- migrations/v4.1-connect-withdrawals.sql, Git blob 64cbb5e72f44ba325df15a333a820382b7aa8d69.
-- Drain legacy withdrawal API writers before enabling this new route in production.
BEGIN;

DO $gate$
DECLARE item record;
BEGIN
  IF to_regclass('akasha_ai.profiles') IS NULL
     OR to_regclass('public.connect_withdrawals') IS NULL THEN
    RAISE EXCEPTION 'withdrawal_schema_unavailable';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('id', 'uuid'), ('user_id', 'uuid'), ('stripe_account_id', 'text'),
    ('stripe_transfer_id', 'text'), ('amount_eur', 'numeric'), ('currency', 'text'),
    ('status', 'text'), ('error', 'text'), ('metadata', 'jsonb'),
    ('created_at', 'timestamptz'), ('completed_at', 'timestamptz')
  ) AS required(name, kind) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.connect_withdrawals'::regclass
        AND attname = item.name AND atttypid = item.kind::regtype
        AND NOT attisdropped
    ) THEN RAISE EXCEPTION 'withdrawal_schema_unavailable: %', item.name; END IF;
  END LOOP;
END
$gate$;

CREATE TABLE IF NOT EXISTS akasha_ai.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  amount_eur numeric(12,2) NOT NULL CHECK (amount_eur >= 20),
  requested_amount_eur numeric(12,2),
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'sending', 'completed', 'rejected', 'reconciliation')),
  attempt_token uuid,
  transfer_id text UNIQUE,
  balance_after_debit numeric(12,2) NOT NULL CHECK (balance_after_debit BETWEEN 0 AND 99999999.99),
  balance_after_restore numeric(12,2) CHECK (balance_after_restore BETWEEN 0 AND 99999999.99),
  failure_code text,
  fraud_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key),
  CHECK (requested_amount_eur IS NULL OR requested_amount_eur = amount_eur),
  CHECK (state <> 'completed' OR (transfer_id IS NOT NULL AND attempt_token IS NOT NULL)),
  CHECK (state <> 'rejected' OR (balance_after_restore IS NOT NULL AND attempt_token IS NOT NULL))
);

-- Different client keys cannot evade an unresolved request for the same owner.
CREATE UNIQUE INDEX IF NOT EXISTS akasha_withdrawal_one_unresolved
  ON akasha_ai.withdrawal_requests(user_id)
  WHERE state IN ('reserved', 'sending', 'reconciliation');
ALTER TABLE akasha_ai.withdrawal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akasha_ai.withdrawal_requests FROM PUBLIC, anon, authenticated, service_role;

-- An explicit cancellation of a not-yet-admitted key must also be durable.
-- Otherwise an older in-flight POST could debit after the client chose a new key.
CREATE TABLE IF NOT EXISTS akasha_ai.withdrawal_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);
ALTER TABLE akasha_ai.withdrawal_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akasha_ai.withdrawal_cancellations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION akasha_ai.withdrawal_request_receipt(
  p_row akasha_ai.withdrawal_requests
) RETURNS jsonb LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'request_id', p_row.id, 'user_id', p_row.user_id, 'request_key', p_row.request_key,
    'amount_eur', p_row.amount_eur, 'requested_amount_eur', p_row.requested_amount_eur,
    'destination', p_row.stripe_account_id, 'mode', p_row.mode, 'state', p_row.state,
    'attempt_token', p_row.attempt_token, 'transfer_id', p_row.transfer_id,
    'new_balance_eur', p_row.balance_after_debit,
    'restored_balance_eur', p_row.balance_after_restore, 'failure_code', p_row.failure_code
  );
$$;
REVOKE ALL ON FUNCTION akasha_ai.withdrawal_request_receipt(akasha_ai.withdrawal_requests)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION akasha_ai.withdrawal_same_request(
  a akasha_ai.withdrawal_requests, b akasha_ai.withdrawal_requests
) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ROW(a.id, a.user_id, a.request_key, a.amount_eur, a.requested_amount_eur,
    a.stripe_account_id, a.mode, a.balance_after_debit, a.fraud_metadata, a.created_at)
    IS NOT DISTINCT FROM ROW(b.id, b.user_id, b.request_key, b.amount_eur, b.requested_amount_eur,
    b.stripe_account_id, b.mode, b.balance_after_debit, b.fraud_metadata, b.created_at);
$$;
REVOKE ALL ON FUNCTION akasha_ai.withdrawal_same_request(akasha_ai.withdrawal_requests, akasha_ai.withdrawal_requests)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION akasha_ai.withdrawal_receipt_matches(
  c public.connect_withdrawals, w akasha_ai.withdrawal_requests,
  transfer text, receipt_status text, failure text
) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ROW(c.id, c.user_id, c.stripe_account_id, c.stripe_transfer_id, c.amount_eur,
    c.currency, c.status, c.error, c.metadata)
    IS NOT DISTINCT FROM ROW(w.id, w.user_id, w.stripe_account_id, transfer, w.amount_eur,
    'eur'::text, receipt_status, failure,
    jsonb_build_object('app', 'akasha_ai', 'withdrawal_request_id', w.id, 'mode', w.mode, 'fraud', w.fraud_metadata));
$$;
REVOKE ALL ON FUNCTION akasha_ai.withdrawal_receipt_matches(public.connect_withdrawals, akasha_ai.withdrawal_requests, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION akasha_ai.verify_withdrawal_persistence(
  expected akasha_ai.withdrawal_requests, expected_receipt public.connect_withdrawals, expected_balance numeric
) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actual akasha_ai.withdrawal_requests; receipt public.connect_withdrawals; balance numeric;
BEGIN
  -- RETURNING precedes AFTER triggers. Re-read every affected value before acknowledgement.
  SELECT * INTO actual FROM akasha_ai.withdrawal_requests WHERE id = expected.id;
  IF NOT FOUND OR actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'withdrawal_persistence_unconfirmed';
  END IF;
  IF expected_receipt.id IS NOT NULL THEN
    SELECT * INTO receipt FROM public.connect_withdrawals WHERE id = expected_receipt.id;
    IF NOT FOUND OR receipt IS DISTINCT FROM expected_receipt THEN
      RAISE EXCEPTION 'withdrawal_receipt_persistence_unconfirmed';
    END IF;
  END IF;
  IF expected_balance IS NOT NULL THEN
    SELECT wallet_balance INTO balance FROM akasha_ai.profiles WHERE id = expected.user_id;
    IF NOT FOUND OR balance IS DISTINCT FROM expected_balance THEN
      RAISE EXCEPTION 'withdrawal_balance_persistence_unconfirmed';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.verify_withdrawal_persistence(akasha_ai.withdrawal_requests, public.connect_withdrawals, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

-- Private common finalizer. Callers hold the owner's profile then the request lock.
CREATE OR REPLACE FUNCTION akasha_ai.finish_withdrawal_rejection(
  previous akasha_ai.withdrawal_requests, balance numeric, token uuid, reason text
) RETURNS akasha_ai.withdrawal_requests LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; c public.connect_withdrawals; restored numeric;
BEGIN
  IF token IS NULL OR balance IS NULL OR NOT (balance BETWEEN 0 AND 99999999.99)
     OR NOT ((previous.state = 'reserved' AND previous.attempt_token IS NULL
         AND reason = 'reservation_expired_unsubmitted')
       OR (previous.state = 'sending' AND previous.attempt_token = token
         AND reason IN ('balance_insufficient', 'amount_too_small', 'amount_too_large',
           'resource_missing', 'parameter_missing', 'parameter_invalid_integer',
           'parameter_invalid_empty', 'parameter_unknown', 'transfers_not_allowed'))) THEN
    RAISE EXCEPTION 'withdrawal_rejection_unproven';
  END IF;
  INSERT INTO public.connect_withdrawals(
    id, user_id, stripe_account_id, amount_eur, currency, status, error, metadata
  ) VALUES (
    previous.id, previous.user_id, previous.stripe_account_id, previous.amount_eur, 'eur', 'failed', reason,
    jsonb_build_object('app', 'akasha_ai', 'withdrawal_request_id', previous.id,
      'mode', previous.mode, 'fraud', previous.fraud_metadata)
  ) RETURNING * INTO c;
  IF NOT FOUND OR NOT akasha_ai.withdrawal_receipt_matches(c, previous, NULL, 'failed', reason) THEN
    RAISE EXCEPTION 'withdrawal_receipt_unconfirmed';
  END IF;
  UPDATE akasha_ai.profiles SET wallet_balance = balance + previous.amount_eur, updated_at = now()
    WHERE id = previous.user_id RETURNING wallet_balance INTO restored;
  IF NOT FOUND OR restored IS DISTINCT FROM balance + previous.amount_eur THEN
    RAISE EXCEPTION 'withdrawal_restoration_unconfirmed';
  END IF;
  UPDATE akasha_ai.withdrawal_requests SET state = 'rejected', failure_code = reason,
    attempt_token = token, balance_after_restore = restored, updated_at = now()
    WHERE id = previous.id RETURNING * INTO w;
  IF NOT FOUND OR NOT akasha_ai.withdrawal_same_request(previous, w)
     OR w.state <> 'rejected' OR w.attempt_token IS DISTINCT FROM token
     OR w.failure_code IS DISTINCT FROM reason OR w.balance_after_restore IS DISTINCT FROM restored
     OR w.transfer_id IS NOT NULL THEN RAISE EXCEPTION 'withdrawal_rejection_unconfirmed'; END IF;
  PERFORM akasha_ai.verify_withdrawal_persistence(w, c, restored);
  RETURN w;
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.finish_withdrawal_rejection(akasha_ai.withdrawal_requests, numeric, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_akasha_withdrawal(p_user_id uuid, p_request_key uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT akasha_ai.withdrawal_request_receipt(w)
  FROM akasha_ai.withdrawal_requests w
  WHERE w.user_id = p_user_id AND (w.request_key = p_request_key
    OR (p_request_key IS NULL AND w.state IN ('reserved', 'sending', 'reconciliation')))
  ORDER BY w.created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cancel_akasha_withdrawal(p_user_id uuid, p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; c akasha_ai.withdrawal_cancellations;
  persisted akasha_ai.withdrawal_cancellations;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'withdrawal_invalid_request'; END IF;
  -- Same lock order as admission. An admitted request cannot be cancelled here.
  PERFORM 1 FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('cancelled', false, 'receipt', akasha_ai.withdrawal_request_receipt(w));
  END IF;
  SELECT * INTO c FROM akasha_ai.withdrawal_cancellations
    WHERE user_id = p_user_id AND request_key = p_request_key;
  IF NOT FOUND THEN
    INSERT INTO akasha_ai.withdrawal_cancellations(user_id, request_key)
      VALUES (p_user_id, p_request_key) RETURNING * INTO c;
    IF NOT FOUND OR c.user_id IS DISTINCT FROM p_user_id OR c.request_key IS DISTINCT FROM p_request_key
       OR c.created_at IS DISTINCT FROM now() THEN RAISE EXCEPTION 'withdrawal_cancellation_unconfirmed'; END IF;
  END IF;
  SELECT * INTO persisted FROM akasha_ai.withdrawal_cancellations WHERE id = c.id;
  IF NOT FOUND OR persisted IS DISTINCT FROM c OR EXISTS (
    SELECT 1 FROM akasha_ai.withdrawal_requests WHERE user_id = p_user_id AND request_key = p_request_key
  ) THEN RAISE EXCEPTION 'withdrawal_cancellation_unconfirmed'; END IF;
  RETURN jsonb_build_object('cancelled', true, 'cancellation_id', c.id,
    'user_id', c.user_id, 'request_key', c.request_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_akasha_withdrawal(
  p_user_id uuid, p_request_key uuid, p_amount_eur numeric,
  p_requested_amount_eur numeric, p_stripe_account_id text, p_mode text,
  p_fraud_metadata jsonb, p_daily_cap numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  w akasha_ai.withdrawal_requests;
  balance numeric;
  debited numeric;
  spent numeric;
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_amount_eur IS NULL
     OR NOT (p_amount_eur BETWEEN 20 AND 99999999.99)
     OR p_amount_eur <> round(p_amount_eur, 2)
     OR (p_requested_amount_eur IS NOT NULL AND p_requested_amount_eur <> p_amount_eur)
     OR p_stripe_account_id IS NULL OR length(p_stripe_account_id) > 255
     OR p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$'
     OR p_mode IS NULL OR p_mode NOT IN ('test', 'live')
     OR (p_daily_cap IS NOT NULL AND p_daily_cap NOT IN (0, 50, 500))
     OR p_fraud_metadata IS NULL OR jsonb_typeof(p_fraud_metadata) <> 'object'
     OR octet_length(p_fraud_metadata::text) > 10000 THEN
    RAISE EXCEPTION 'withdrawal_invalid_request';
  END IF;
  -- Serialize every request for the owner, including distinct keys.
  SELECT p.wallet_balance INTO balance FROM akasha_ai.profiles p
    WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND OR balance IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF NOT (balance BETWEEN 0 AND 99999999.99) THEN RAISE EXCEPTION 'withdrawal_balance_unconfirmed'; END IF;
  IF EXISTS (SELECT 1 FROM akasha_ai.withdrawal_cancellations
      WHERE user_id = p_user_id AND request_key = p_request_key) THEN
    RAISE EXCEPTION 'withdrawal_request_cancelled';
  END IF;
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF FOUND THEN
    IF w.amount_eur <> p_amount_eur
       OR w.requested_amount_eur IS DISTINCT FROM p_requested_amount_eur
       OR w.stripe_account_id <> p_stripe_account_id OR w.mode <> p_mode THEN
      RAISE EXCEPTION 'withdrawal_request_conflict';
    END IF;
    RETURN akasha_ai.withdrawal_request_receipt(w);
  END IF;
  IF EXISTS (SELECT 1 FROM akasha_ai.withdrawal_requests
      WHERE user_id = p_user_id AND state IN ('reserved', 'sending', 'reconciliation')) THEN
    RAISE EXCEPTION 'withdrawal_in_progress';
  END IF;
  IF p_daily_cap IS NOT NULL THEN
    -- Unknown shared history is not treated as zero. Legacy failed/reversed rows
    -- are counted conservatively because their refund acknowledgement is absent.
    IF EXISTS (
      SELECT 1 FROM public.connect_withdrawals c
      WHERE c.user_id = p_user_id AND c.created_at >= day_start
        AND c.created_at < day_start + interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM akasha_ai.withdrawal_requests r WHERE r.id = c.id)
        AND c.metadata->>'app' IS DISTINCT FROM 'akasha_ai'
    ) THEN RAISE EXCEPTION 'withdrawal_history_ambiguous'; END IF;
    SELECT COALESCE(sum(amount_eur), 0) INTO spent FROM (
      SELECT r.amount_eur FROM akasha_ai.withdrawal_requests r
      WHERE r.user_id = p_user_id AND r.created_at >= day_start
        AND r.created_at < day_start + interval '24 hours' AND r.state <> 'rejected'
      UNION ALL
      SELECT c.amount_eur FROM public.connect_withdrawals c
      WHERE c.user_id = p_user_id AND c.created_at >= day_start
        AND c.created_at < day_start + interval '24 hours'
        AND c.metadata->>'app' = 'akasha_ai'
        AND NOT EXISTS (SELECT 1 FROM akasha_ai.withdrawal_requests r WHERE r.id = c.id)
    ) AS admitted;
    IF spent + p_amount_eur > p_daily_cap THEN
      RAISE EXCEPTION 'withdrawal_daily_cap_exceeded';
    END IF;
  END IF;
  IF balance < p_amount_eur THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE akasha_ai.profiles SET wallet_balance = balance - p_amount_eur, updated_at = now()
    WHERE id = p_user_id RETURNING wallet_balance INTO debited;
  IF NOT FOUND OR debited IS DISTINCT FROM balance - p_amount_eur THEN
    RAISE EXCEPTION 'withdrawal_debit_unconfirmed';
  END IF;
  INSERT INTO akasha_ai.withdrawal_requests(
    user_id, request_key, amount_eur, requested_amount_eur, stripe_account_id,
    mode, balance_after_debit, fraud_metadata
  ) VALUES (
    p_user_id, p_request_key, p_amount_eur, p_requested_amount_eur, p_stripe_account_id,
    p_mode, balance - p_amount_eur, p_fraud_metadata
  ) RETURNING * INTO w;
  IF NOT FOUND OR w.user_id IS DISTINCT FROM p_user_id OR w.request_key IS DISTINCT FROM p_request_key
     OR w.amount_eur IS DISTINCT FROM p_amount_eur OR w.requested_amount_eur IS DISTINCT FROM p_requested_amount_eur
     OR w.stripe_account_id IS DISTINCT FROM p_stripe_account_id OR w.mode IS DISTINCT FROM p_mode
     OR w.balance_after_debit IS DISTINCT FROM debited OR w.state <> 'reserved'
     OR w.attempt_token IS NOT NULL OR w.transfer_id IS NOT NULL OR w.balance_after_restore IS NOT NULL
     OR w.failure_code IS NOT NULL OR w.fraud_metadata IS DISTINCT FROM p_fraud_metadata
     OR w.created_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'withdrawal_admission_unconfirmed';
  END IF;
  PERFORM akasha_ai.verify_withdrawal_persistence(w, NULL, debited);
  RETURN akasha_ai.withdrawal_request_receipt(w);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_akasha_withdrawal(
  p_user_id uuid, p_request_key uuid, p_attempt_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; previous akasha_ai.withdrawal_requests; balance numeric;
BEGIN
  IF p_attempt_token IS NULL THEN RAISE EXCEPTION 'withdrawal_invalid_attempt'; END IF;
  SELECT wallet_balance INTO balance FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  -- A lost acknowledgement never reissues permission, even for the same token.
  IF w.state <> 'reserved' THEN
    RETURN akasha_ai.withdrawal_request_receipt(w) || '{"send_authorized":false}'::jsonb;
  END IF;
  IF (w.created_at AT TIME ZONE 'UTC')::date <> (now() AT TIME ZONE 'UTC')::date THEN
    w := akasha_ai.finish_withdrawal_rejection(w, balance, p_attempt_token, 'reservation_expired_unsubmitted');
    RETURN akasha_ai.withdrawal_request_receipt(w) || '{"send_authorized":false}'::jsonb;
  END IF;
  previous := w;
  UPDATE akasha_ai.withdrawal_requests SET state = 'sending',
    attempt_token = p_attempt_token, updated_at = now()
    WHERE id = w.id RETURNING * INTO w;
  IF NOT FOUND OR NOT akasha_ai.withdrawal_same_request(previous, w)
     OR w.state <> 'sending' OR w.attempt_token IS DISTINCT FROM p_attempt_token
     OR w.transfer_id IS NOT NULL OR w.balance_after_restore IS NOT NULL OR w.failure_code IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawal_claim_unconfirmed';
  END IF;
  PERFORM akasha_ai.verify_withdrawal_persistence(w, NULL, NULL);
  RETURN akasha_ai.withdrawal_request_receipt(w) || '{"send_authorized":true}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_akasha_withdrawal(
  p_user_id uuid, p_request_key uuid, p_attempt_token uuid, p_transfer_id text,
  p_amount_eur numeric, p_destination text, p_mode text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; previous akasha_ai.withdrawal_requests; c public.connect_withdrawals;
BEGIN
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF p_attempt_token IS NULL OR w.attempt_token IS DISTINCT FROM p_attempt_token
     OR p_amount_eur IS NULL OR w.amount_eur <> p_amount_eur
     OR p_destination IS NULL OR w.stripe_account_id <> p_destination
     OR p_mode IS NULL OR w.mode <> p_mode
     OR p_transfer_id IS NULL OR length(p_transfer_id) > 255
     OR p_transfer_id !~ '^tr_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'withdrawal_receipt_conflict';
  END IF;
  IF w.state = 'completed' AND w.transfer_id = p_transfer_id THEN
    RETURN akasha_ai.withdrawal_request_receipt(w);
  END IF;
  IF w.state NOT IN ('sending', 'reconciliation') THEN
    RAISE EXCEPTION 'withdrawal_receipt_conflict';
  END IF;
  previous := w;
  INSERT INTO public.connect_withdrawals(
    id, user_id, stripe_account_id, stripe_transfer_id, amount_eur, currency, status, metadata
  ) VALUES (
    w.id, w.user_id, w.stripe_account_id, p_transfer_id, w.amount_eur, 'eur', 'pending',
    jsonb_build_object('app', 'akasha_ai', 'withdrawal_request_id', w.id,
      'mode', w.mode, 'fraud', w.fraud_metadata)
  ) RETURNING * INTO c;
  IF NOT FOUND OR NOT akasha_ai.withdrawal_receipt_matches(c, w, p_transfer_id, 'pending', NULL) THEN
    RAISE EXCEPTION 'withdrawal_receipt_unconfirmed';
  END IF;
  UPDATE akasha_ai.withdrawal_requests SET state = 'completed', transfer_id = p_transfer_id,
    failure_code = NULL, updated_at = now() WHERE id = w.id RETURNING * INTO w;
  IF NOT FOUND OR NOT akasha_ai.withdrawal_same_request(previous, w)
     OR w.state <> 'completed' OR w.transfer_id IS DISTINCT FROM p_transfer_id
     OR w.attempt_token IS DISTINCT FROM p_attempt_token OR w.failure_code IS NOT NULL
     OR w.balance_after_restore IS NOT NULL THEN RAISE EXCEPTION 'withdrawal_completion_unconfirmed'; END IF;
  PERFORM akasha_ai.verify_withdrawal_persistence(w, c, NULL);
  RETURN akasha_ai.withdrawal_request_receipt(w);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_akasha_withdrawal(
  p_user_id uuid, p_request_key uuid, p_attempt_token uuid, p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; balance numeric;
BEGIN
  -- Lock order is always profile before request for operations changing a balance.
  SELECT wallet_balance INTO balance FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR balance IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF p_attempt_token IS NULL OR w.attempt_token IS DISTINCT FROM p_attempt_token
     OR p_failure_code IS NULL OR p_failure_code NOT IN (
       'balance_insufficient', 'amount_too_small', 'amount_too_large',
       'resource_missing', 'parameter_missing', 'parameter_invalid_integer',
       'parameter_invalid_empty', 'parameter_unknown', 'transfers_not_allowed'
     ) THEN RAISE EXCEPTION 'withdrawal_rejection_unproven'; END IF;
  IF w.state = 'rejected' AND w.failure_code = p_failure_code THEN
    RETURN akasha_ai.withdrawal_request_receipt(w);
  END IF;
  IF w.state <> 'sending' THEN RAISE EXCEPTION 'withdrawal_rejection_unproven'; END IF;
  w := akasha_ai.finish_withdrawal_rejection(w, balance, p_attempt_token, p_failure_code);
  RETURN akasha_ai.withdrawal_request_receipt(w);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_akasha_withdrawal(
  p_user_id uuid, p_request_key uuid, p_attempt_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE w akasha_ai.withdrawal_requests; previous akasha_ai.withdrawal_requests;
BEGIN
  SELECT * INTO w FROM akasha_ai.withdrawal_requests
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND OR p_attempt_token IS NULL OR w.attempt_token IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'withdrawal_attempt_conflict';
  END IF;
  IF w.state = 'sending' THEN
    previous := w;
    UPDATE akasha_ai.withdrawal_requests SET state = 'reconciliation',
      failure_code = 'outcome_unconfirmed', updated_at = now()
      WHERE id = w.id RETURNING * INTO w;
    IF NOT FOUND OR NOT akasha_ai.withdrawal_same_request(previous, w)
       OR w.state <> 'reconciliation' OR w.attempt_token IS DISTINCT FROM p_attempt_token
       OR w.failure_code IS DISTINCT FROM 'outcome_unconfirmed'
       OR w.transfer_id IS NOT NULL OR w.balance_after_restore IS NOT NULL THEN
      RAISE EXCEPTION 'withdrawal_reconciliation_unconfirmed';
    END IF;
    PERFORM akasha_ai.verify_withdrawal_persistence(w, NULL, NULL);
  END IF;
  RETURN akasha_ai.withdrawal_request_receipt(w);
END;
$$;

REVOKE ALL ON FUNCTION public.get_akasha_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_akasha_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_akasha_withdrawal(uuid, uuid, numeric, numeric, text, text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_akasha_withdrawal(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_akasha_withdrawal(uuid, uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_akasha_withdrawal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_akasha_withdrawal(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_akasha_withdrawal(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_akasha_withdrawal(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_akasha_withdrawal(uuid, uuid, numeric, numeric, text, text, jsonb, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_akasha_withdrawal(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_akasha_withdrawal(uuid, uuid, uuid, text, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_akasha_withdrawal(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_akasha_withdrawal(uuid, uuid, uuid) TO service_role;

COMMIT;
