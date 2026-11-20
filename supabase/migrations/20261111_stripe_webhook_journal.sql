-- One admission authority for both authenticated AKASHA Stripe ingress routes.
-- This is a delivery/effect-state journal, not an earned-revenue ledger.
-- No legacy claim is deleted or treated as proof that its effects completed.
-- There is deliberately no expiry, takeover, automatic replay or worker.
BEGIN;

DO $legacy_prerequisites$
BEGIN
  IF to_regclass('akasha_ai.stripe_events') IS NULL
    OR to_regclass('akasha_ai.stripe_events_processed') IS NULL
  THEN
    RAISE EXCEPTION 'Legacy Stripe claim tables must be preserved before journal installation';
  END IF;
END
$legacy_prerequisites$;

CREATE TABLE akasha_ai.stripe_webhook_journal (
  stripe_account_key text NOT NULL CHECK (length(stripe_account_key) BETWEEN 1 AND 255),
  livemode boolean NOT NULL,
  event_id text NOT NULL CHECK (event_id LIKE 'evt\_%' ESCAPE '\' AND length(event_id) <= 255),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 255),
  event_created bigint NOT NULL CHECK (event_created BETWEEN 0 AND 9007199254740991),
  api_version text CHECK (api_version IS NULL OR length(api_version) BETWEEN 1 AND 255),
  event_data jsonb NOT NULL CHECK (jsonb_typeof(event_data) = 'object'),
  evidence_version integer NOT NULL CHECK (evidence_version = 1),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  attempt_token uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'reconciliation_required')),
  legacy_claim boolean NOT NULL DEFAULT false,
  reconciliation_reason text CHECK (
    reconciliation_reason IS NULL OR
    reconciliation_reason IN ('legacy_claim', 'effect_failed', 'completion_unconfirmed')
  ),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (stripe_account_key, livemode, event_id),
  CHECK (NOT legacy_claim OR (state = 'reconciliation_required' AND reconciliation_reason = 'legacy_claim')),
  CHECK ((state = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((state = 'reconciliation_required') = (reconciliation_reason IS NOT NULL))
);

ALTER TABLE akasha_ai.stripe_webhook_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akasha_ai.stripe_webhook_journal FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON akasha_ai.stripe_webhook_journal TO service_role;
CREATE POLICY stripe_webhook_journal_service_read
  ON akasha_ai.stripe_webhook_journal FOR SELECT TO service_role USING (true);

CREATE FUNCTION akasha_ai.admit_stripe_webhook_event(p_event jsonb, p_attempt_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $admit_event$
DECLARE
  receipt akasha_ai.stripe_webhook_journal%ROWTYPE;
  admitted boolean;
  legacy boolean;
BEGIN
  IF p_attempt_token IS NULL OR p_event IS NULL OR jsonb_typeof(p_event) <> 'object'
    OR octet_length(p_event::text) > 131072
    OR jsonb_typeof(p_event->'version') IS DISTINCT FROM 'number'
    OR p_event->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p_event->'stripe_account_key') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_event->'livemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_event->'event_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_event->'event_type') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_event->'event_created') IS DISTINCT FROM 'number'
    OR (p_event->>'event_created') !~ '^[0-9]+$'
    OR jsonb_typeof(p_event->'event_data') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_event->'fingerprint') IS DISTINCT FROM 'string'
    OR (p_event->>'fingerprint') !~ '^[0-9a-f]{64}$'
    OR (p_event->'api_version' IS NOT NULL
      AND jsonb_typeof(p_event->'api_version') NOT IN ('null', 'string'))
  THEN
    RAISE EXCEPTION 'Invalid Stripe webhook journal envelope' USING ERRCODE = '22023';
  END IF;

  -- Legacy tables lack account/mode and completion evidence. An event found in
  -- either remains ambiguous for every namespace; never reinterpret it as done.
  SELECT EXISTS (
    SELECT 1 FROM akasha_ai.stripe_events WHERE event_id = p_event->>'event_id'
    UNION ALL
    SELECT 1 FROM akasha_ai.stripe_events_processed WHERE event_id = p_event->>'event_id'
  ) INTO legacy;

  INSERT INTO akasha_ai.stripe_webhook_journal (
    stripe_account_key, livemode, event_id, event_type, event_created, api_version,
    event_data, evidence_version, fingerprint, attempt_token, state,
    legacy_claim, reconciliation_reason
  ) VALUES (
    p_event->>'stripe_account_key', (p_event->>'livemode')::boolean,
    p_event->>'event_id', p_event->>'event_type', (p_event->>'event_created')::bigint,
    p_event->>'api_version', p_event->'event_data', 1,
    p_event->>'fingerprint', p_attempt_token,
    CASE WHEN legacy THEN 'reconciliation_required' ELSE 'processing' END,
    legacy, CASE WHEN legacy THEN 'legacy_claim' ELSE NULL END
  ) ON CONFLICT (stripe_account_key, livemode, event_id) DO NOTHING
  RETURNING * INTO receipt;
  admitted := FOUND AND NOT legacy;

  IF receipt.event_id IS NULL THEN
    SELECT * INTO STRICT receipt FROM akasha_ai.stripe_webhook_journal
    WHERE stripe_account_key = p_event->>'stripe_account_key'
      AND livemode = (p_event->>'livemode')::boolean
      AND event_id = p_event->>'event_id';
    IF receipt.fingerprint IS DISTINCT FROM p_event->>'fingerprint'
      OR receipt.event_type IS DISTINCT FROM p_event->>'event_type'
      OR receipt.event_created IS DISTINCT FROM (p_event->>'event_created')::bigint
      OR receipt.api_version IS DISTINCT FROM p_event->>'api_version'
      OR receipt.event_data IS DISTINCT FROM p_event->'event_data'
      OR receipt.evidence_version IS DISTINCT FROM 1
    THEN
      RAISE EXCEPTION 'Conflicting authenticated Stripe event evidence' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'admitted', admitted, 'state', receipt.state, 'legacy', receipt.legacy_claim,
    'stripe_account_key', receipt.stripe_account_key, 'livemode', receipt.livemode,
    'event_id', receipt.event_id, 'fingerprint', receipt.fingerprint,
    'attempt_token', CASE WHEN admitted THEN receipt.attempt_token ELSE NULL END
  );
END
$admit_event$;

CREATE FUNCTION akasha_ai.complete_stripe_webhook_event(p_identity jsonb, p_attempt_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $complete_event$
DECLARE
  receipt akasha_ai.stripe_webhook_journal%ROWTYPE;
BEGIN
  IF p_attempt_token IS NULL OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_identity->'livemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_identity->'stripe_account_key') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'event_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'fingerprint') IS DISTINCT FROM 'string'
    OR (p_identity->>'fingerprint') !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid webhook completion identity' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO receipt FROM akasha_ai.stripe_webhook_journal
  WHERE stripe_account_key = p_identity->>'stripe_account_key'
    AND livemode = (p_identity->>'livemode')::boolean
    AND event_id = p_identity->>'event_id'
    AND fingerprint = p_identity->>'fingerprint'
    AND attempt_token = p_attempt_token
  FOR UPDATE;
  IF NOT FOUND OR receipt.legacy_claim
    OR receipt.state NOT IN ('processing', 'completed')
  THEN
    RAISE EXCEPTION 'Webhook completion does not own a completable attempt' USING ERRCODE = '55000';
  END IF;
  IF receipt.state = 'processing' THEN
    UPDATE akasha_ai.stripe_webhook_journal
    SET state = 'completed', completed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE stripe_account_key = receipt.stripe_account_key AND livemode = receipt.livemode
      AND event_id = receipt.event_id AND attempt_token = p_attempt_token;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Webhook completion changed no row' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'completed', true, 'stripe_account_key', receipt.stripe_account_key,
    'livemode', receipt.livemode, 'event_id', receipt.event_id,
    'fingerprint', receipt.fingerprint, 'attempt_token', receipt.attempt_token
  );
END
$complete_event$;

CREATE FUNCTION akasha_ai.reconcile_stripe_webhook_event(
  p_identity jsonb, p_attempt_token uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $reconcile_event$
DECLARE
  receipt akasha_ai.stripe_webhook_journal%ROWTYPE;
BEGIN
  IF p_attempt_token IS NULL OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_identity->'livemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_identity->'stripe_account_key') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'event_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'fingerprint') IS DISTINCT FROM 'string'
    OR (p_identity->>'fingerprint') !~ '^[0-9a-f]{64}$'
    OR p_reason IS NULL OR p_reason NOT IN ('effect_failed', 'completion_unconfirmed')
  THEN
    RAISE EXCEPTION 'Invalid webhook reconciliation identity' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO receipt FROM akasha_ai.stripe_webhook_journal
  WHERE stripe_account_key = p_identity->>'stripe_account_key'
    AND livemode = (p_identity->>'livemode')::boolean
    AND event_id = p_identity->>'event_id'
    AND fingerprint = p_identity->>'fingerprint'
    AND attempt_token = p_attempt_token
  FOR UPDATE;
  IF NOT FOUND OR receipt.legacy_claim THEN
    RAISE EXCEPTION 'Webhook reconciliation does not own the attempt' USING ERRCODE = '55000';
  END IF;
  IF receipt.state = 'processing' THEN
    UPDATE akasha_ai.stripe_webhook_journal
    SET state = 'reconciliation_required', reconciliation_reason = p_reason,
        updated_at = clock_timestamp()
    WHERE stripe_account_key = receipt.stripe_account_key AND livemode = receipt.livemode
      AND event_id = receipt.event_id AND attempt_token = p_attempt_token;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Webhook reconciliation changed no row' USING ERRCODE = '55000';
    END IF;
    receipt.state := 'reconciliation_required';
  END IF;
  -- A completion whose response was lost must never be downgraded.
  RETURN jsonb_build_object(
    'recorded', true, 'state', receipt.state,
    'stripe_account_key', receipt.stripe_account_key, 'livemode', receipt.livemode,
    'event_id', receipt.event_id, 'fingerprint', receipt.fingerprint,
    'attempt_token', receipt.attempt_token
  );
END
$reconcile_event$;

REVOKE ALL ON FUNCTION akasha_ai.admit_stripe_webhook_event(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION akasha_ai.complete_stripe_webhook_event(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION akasha_ai.reconcile_stripe_webhook_event(jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.admit_stripe_webhook_event(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.complete_stripe_webhook_event(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.reconcile_stripe_webhook_event(jsonb, uuid, text) TO service_role;

COMMENT ON TABLE akasha_ai.stripe_webhook_journal IS
  'Private authenticated event evidence. completed confirms this attempt only; partial/legacy effects require reconciliation. Distinct events and non-atomic financial effects remain separate concerns.';
COMMIT;
