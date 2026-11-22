-- Optional editorial/marketing sequences require an explicitly stored
-- newsletter=true. UI defaults and unrelated categories are not consent.
-- Explicit product-update and digest refusals remain additional vetoes.
-- Drain the old cron before coordinated rollout: its check-then-send path does
-- not participate in this journal. No legacy log is deleted or marked sent.
BEGIN;

DO $prerequisites$
BEGIN
  IF to_regclass('akasha_ai.profiles') IS NULL
    OR to_regclass('akasha_ai.notification_preferences') IS NULL
    OR to_regclass('akasha_ai.email_sequences') IS NULL
  THEN RAISE EXCEPTION 'Email delivery requires the existing profile, preference and history tables'; END IF;
END
$prerequisites$;

-- Keep the incoming migration and its read-only history policies, but retire
-- its unconfirmed boolean recorder. Only the durable protocol may acknowledge
-- provider acceptance after rollout. Standalone installations may lack it.
DO $retire_legacy_recorder$
BEGIN
  IF to_regprocedure('akasha_ai.record_email_sequence_delivery(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION akasha_ai.record_email_sequence_delivery(uuid,text)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END
$retire_legacy_recorder$;

CREATE TABLE akasha_ai.email_sequence_deliveries (
  user_id uuid NOT NULL REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN (
    'welcome', 'tip_day1', 'relaunch_day3', 'tips_day7',
    'upgrade_day14', 'testimonial_day21', 'winback_day30'
  )),
  attempt_token uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('sending', 'sent', 'reconciliation_required')),
  provider_email_id text UNIQUE CHECK (provider_email_id IS NULL OR provider_email_id ~ '^[^[:space:]]{1,255}$'),
  reason text CHECK (reason IS NULL OR reason IN ('legacy_receipt', 'provider_unconfirmed', 'completion_unconfirmed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz,
  PRIMARY KEY (user_id, email_type),
  CHECK ((state = 'sent') = (accepted_at IS NOT NULL)),
  CHECK (state <> 'sent' OR provider_email_id IS NOT NULL),
  CHECK ((state = 'reconciliation_required') = (reason IS NOT NULL))
);

ALTER TABLE akasha_ai.email_sequence_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akasha_ai.email_sequence_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON akasha_ai.email_sequence_deliveries TO service_role;
CREATE POLICY email_sequence_deliveries_service_read ON akasha_ai.email_sequence_deliveries
  FOR SELECT TO service_role USING (true);

CREATE FUNCTION akasha_ai.claim_email_sequence_delivery(
  p_user_id uuid, p_email_type text, p_attempt_token uuid, p_payload_hash text, p_recipient text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $claim$
DECLARE
  actual_email text;
  preferences akasha_ai.notification_preferences%ROWTYPE;
  delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
  inserted_delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
  identity jsonb;
  legacy boolean;
  admitted boolean;
  inserted boolean;
BEGIN
  IF p_user_id IS NULL OR p_attempt_token IS NULL
    OR p_email_type IS NULL OR p_email_type NOT IN (
      'welcome', 'tip_day1', 'relaunch_day3', 'tips_day7',
      'upgrade_day14', 'testimonial_day21', 'winback_day30'
    ) OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
    OR p_recipient IS NULL OR length(btrim(p_recipient)) NOT BETWEEN 1 AND 320
    OR p_recipient ~ '[[:cntrl:]]'
  THEN RAISE EXCEPTION 'Invalid email admission identity' USING ERRCODE = '22023'; END IF;
  identity := jsonb_build_object('version', 1, 'user_id', p_user_id, 'email_type', p_email_type,
    'attempt_token', p_attempt_token, 'payload_hash', p_payload_hash);

  SELECT email INTO actual_email FROM akasha_ai.profiles WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR actual_email IS DISTINCT FROM p_recipient
  THEN RAISE EXCEPTION 'Email recipient no longer matches the profile' USING ERRCODE = '22023'; END IF;
  SELECT * INTO preferences FROM akasha_ai.notification_preferences WHERE user_id = p_user_id FOR SHARE;
  IF NOT FOUND OR jsonb_typeof(preferences.types) IS DISTINCT FROM 'object'
    OR preferences.types->'newsletter' IS DISTINCT FROM 'true'::jsonb
  THEN RETURN identity || jsonb_build_object('status', 'not_subscribed'); END IF;
  IF (p_email_type IN ('welcome', 'tip_day1') AND preferences.types->'product_updates' = 'false'::jsonb)
    OR (p_email_type = 'tips_day7' AND preferences.types->'weekly_digest' = 'false'::jsonb)
  THEN RETURN identity || jsonb_build_object('status', 'not_subscribed'); END IF;
  IF preferences.paused_until > clock_timestamp()
  THEN RETURN identity || jsonb_build_object('status', 'paused'); END IF;

  SELECT EXISTS(SELECT 1 FROM akasha_ai.email_sequences
    WHERE user_id = p_user_id AND email_type = p_email_type) INTO legacy;
  INSERT INTO akasha_ai.email_sequence_deliveries (
    user_id, email_type, attempt_token, payload_hash, state, reason
  ) VALUES (
    p_user_id, p_email_type, p_attempt_token, p_payload_hash,
    CASE WHEN legacy THEN 'reconciliation_required' ELSE 'sending' END,
    CASE WHEN legacy THEN 'legacy_receipt' ELSE NULL END
  ) ON CONFLICT (user_id, email_type) DO NOTHING RETURNING * INTO delivery;
  inserted := FOUND;
  IF inserted THEN
    IF delivery.user_id IS DISTINCT FROM p_user_id OR delivery.email_type IS DISTINCT FROM p_email_type
      OR delivery.attempt_token IS DISTINCT FROM p_attempt_token OR delivery.payload_hash IS DISTINCT FROM p_payload_hash
      OR delivery.state IS DISTINCT FROM (CASE WHEN legacy THEN 'reconciliation_required' ELSE 'sending' END)
      OR delivery.reason IS DISTINCT FROM (CASE WHEN legacy THEN 'legacy_receipt' ELSE NULL END)
      OR delivery.provider_email_id IS NOT NULL OR delivery.accepted_at IS NOT NULL
    THEN RAISE EXCEPTION 'Email admission write did not preserve the requested identity' USING ERRCODE = '55000'; END IF;
    inserted_delivery := delivery;
    -- RETURNING sees BEFORE-trigger changes. Read again to include AFTER-trigger
    -- effects before handing permission to the external sender.
    SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
      WHERE user_id = p_user_id AND email_type = p_email_type FOR UPDATE;
    IF NOT FOUND OR delivery IS DISTINCT FROM inserted_delivery
    THEN RAISE EXCEPTION 'Email admission receipt was not persisted unchanged' USING ERRCODE = '55000'; END IF;
  ELSE
    SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
      WHERE user_id = p_user_id AND email_type = p_email_type;
    IF NOT FOUND THEN RAISE EXCEPTION 'Email admission has no durable receipt' USING ERRCODE = '55000'; END IF;
  END IF;
  admitted := inserted AND NOT legacy;
  -- A durable sending claim has no expiry or automatic takeover. A lost
  -- response, process crash or historical log requires reconciliation.
  RETURN identity || jsonb_build_object('status', CASE
    WHEN admitted THEN 'claimed'
    WHEN delivery.state = 'sent' THEN 'already_sent'
    ELSE 'reconciliation_required' END);
END
$claim$;

CREATE FUNCTION akasha_ai.complete_email_sequence_delivery(
  p_user_id uuid, p_email_type text, p_attempt_token uuid, p_payload_hash text, p_provider_email_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $complete$
DECLARE
  delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
  expected_delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
  written_log akasha_ai.email_sequences%ROWTYPE;
  persisted_log akasha_ai.email_sequences%ROWTYPE;
  confirmed_at timestamptz;
BEGIN
  IF p_provider_email_id IS NULL OR p_provider_email_id !~ '^[^[:space:]]{1,255}$'
  THEN RAISE EXCEPTION 'Missing provider acceptance identity' USING ERRCODE = '22023'; END IF;
  SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
    WHERE user_id = p_user_id AND email_type = p_email_type
      AND attempt_token = p_attempt_token AND payload_hash = p_payload_hash FOR UPDATE;
  IF NOT FOUND OR delivery.reason = 'legacy_receipt'
    OR (delivery.provider_email_id IS NOT NULL AND delivery.provider_email_id <> p_provider_email_id)
  THEN RAISE EXCEPTION 'Email completion does not own the receipt' USING ERRCODE = '55000'; END IF;
  IF delivery.state <> 'sent' THEN
    confirmed_at := clock_timestamp();
    expected_delivery := delivery;
    expected_delivery.state := 'sent'; expected_delivery.reason := NULL;
    expected_delivery.provider_email_id := p_provider_email_id;
    expected_delivery.accepted_at := confirmed_at; expected_delivery.updated_at := confirmed_at;
    INSERT INTO akasha_ai.email_sequences(user_id, email_type, sent_at)
      VALUES (p_user_id, p_email_type, confirmed_at) RETURNING * INTO written_log;
    IF NOT FOUND OR written_log.id IS NULL OR written_log.user_id IS DISTINCT FROM p_user_id
      OR written_log.email_type IS DISTINCT FROM p_email_type OR written_log.sent_at IS DISTINCT FROM confirmed_at
      OR written_log.opened IS DISTINCT FROM false OR written_log.clicked IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'Email acceptance log was not written as requested' USING ERRCODE = '55000'; END IF;
    SELECT * INTO persisted_log FROM akasha_ai.email_sequences WHERE id = written_log.id FOR UPDATE;
    IF NOT FOUND OR persisted_log IS DISTINCT FROM written_log
    THEN RAISE EXCEPTION 'Email acceptance log was not persisted unchanged' USING ERRCODE = '55000'; END IF;
    UPDATE akasha_ai.email_sequence_deliveries SET state = 'sent', reason = NULL,
      provider_email_id = p_provider_email_id, accepted_at = confirmed_at, updated_at = confirmed_at
      WHERE user_id = p_user_id AND email_type = p_email_type AND attempt_token = p_attempt_token
      RETURNING * INTO delivery;
    IF NOT FOUND OR delivery IS DISTINCT FROM expected_delivery
    THEN RAISE EXCEPTION 'Email completion did not write the matching receipt' USING ERRCODE = '55000'; END IF;
    SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
      WHERE user_id = p_user_id AND email_type = p_email_type FOR UPDATE;
    IF NOT FOUND OR delivery IS DISTINCT FROM expected_delivery
    THEN RAISE EXCEPTION 'Email completion receipt was not persisted unchanged' USING ERRCODE = '55000'; END IF;
    -- The final journal write can itself have triggers touching the log.
    -- Both sides must still agree after the last write, not just after INSERT.
    SELECT * INTO persisted_log FROM akasha_ai.email_sequences WHERE id = written_log.id FOR UPDATE;
    IF NOT FOUND OR persisted_log IS DISTINCT FROM written_log
    THEN RAISE EXCEPTION 'Email acceptance log changed during finalization' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN jsonb_build_object('version', 1, 'status', delivery.state, 'user_id', delivery.user_id, 'email_type', delivery.email_type,
    'attempt_token', delivery.attempt_token, 'payload_hash', delivery.payload_hash, 'provider_email_id', delivery.provider_email_id);
END
$complete$;

CREATE FUNCTION akasha_ai.reconcile_email_sequence_delivery(
  p_user_id uuid, p_email_type text, p_attempt_token uuid, p_payload_hash text,
  p_provider_email_id text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, akasha_ai
AS $reconcile$
DECLARE
  delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
  expected_delivery akasha_ai.email_sequence_deliveries%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('provider_unconfirmed', 'completion_unconfirmed')
    OR (p_provider_email_id IS NOT NULL AND p_provider_email_id !~ '^[^[:space:]]{1,255}$')
  THEN RAISE EXCEPTION 'Invalid email reconciliation reason' USING ERRCODE = '22023'; END IF;
  SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
    WHERE user_id = p_user_id AND email_type = p_email_type
      AND attempt_token = p_attempt_token AND payload_hash = p_payload_hash FOR UPDATE;
  IF NOT FOUND OR delivery.reason = 'legacy_receipt'
    OR (delivery.provider_email_id IS NOT NULL AND p_provider_email_id IS NOT NULL
      AND delivery.provider_email_id <> p_provider_email_id)
  THEN RAISE EXCEPTION 'Email reconciliation does not own the receipt' USING ERRCODE = '55000'; END IF;
  IF delivery.state <> 'sent' THEN
    expected_delivery := delivery;
    expected_delivery.state := 'reconciliation_required'; expected_delivery.reason := p_reason;
    expected_delivery.provider_email_id := COALESCE(delivery.provider_email_id, p_provider_email_id);
    expected_delivery.updated_at := clock_timestamp();
    UPDATE akasha_ai.email_sequence_deliveries SET state = 'reconciliation_required', reason = p_reason,
      provider_email_id = expected_delivery.provider_email_id, updated_at = expected_delivery.updated_at
      WHERE user_id = p_user_id AND email_type = p_email_type AND attempt_token = p_attempt_token
      RETURNING * INTO delivery;
    IF NOT FOUND OR delivery IS DISTINCT FROM expected_delivery
    THEN RAISE EXCEPTION 'Email reconciliation did not write the matching receipt' USING ERRCODE = '55000'; END IF;
    SELECT * INTO delivery FROM akasha_ai.email_sequence_deliveries
      WHERE user_id = p_user_id AND email_type = p_email_type FOR UPDATE;
    IF NOT FOUND OR delivery IS DISTINCT FROM expected_delivery
    THEN RAISE EXCEPTION 'Email reconciliation receipt was not persisted unchanged' USING ERRCODE = '55000'; END IF;
  END IF;
  -- A confirmed completion whose response was lost is never downgraded.
  RETURN jsonb_build_object('version', 1, 'status', delivery.state, 'user_id', delivery.user_id, 'email_type', delivery.email_type,
    'attempt_token', delivery.attempt_token, 'payload_hash', delivery.payload_hash);
END
$reconcile$;

REVOKE ALL ON FUNCTION akasha_ai.claim_email_sequence_delivery(uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION akasha_ai.complete_email_sequence_delivery(uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION akasha_ai.reconcile_email_sequence_delivery(uuid,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.claim_email_sequence_delivery(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.complete_email_sequence_delivery(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.reconcile_email_sequence_delivery(uuid,text,uuid,text,text,text) TO service_role;
COMMENT ON TABLE akasha_ai.email_sequence_deliveries IS
  'Optional newsletter acceptance journal. No automatic takeover or resend; sent is provider acceptance, not inbox delivery. Legacy or ambiguous attempts require independent reconciliation.';
COMMIT;
