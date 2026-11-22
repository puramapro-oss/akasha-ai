-- Existing histories are preserved. Apply before deploying the matching handlers.
-- A browser cannot bypass the atomic share ledger with direct point writes.
BEGIN;

ALTER TABLE akasha_ai.social_shares ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS social_shares_user_request_unique
  ON akasha_ai.social_shares(user_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_shares_user_day_idx ON akasha_ai.social_shares(user_id, shared_at);

CREATE OR REPLACE FUNCTION akasha_ai.record_social_share(
  p_request_id uuid, p_share_code text, p_platform_hint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code text;
  v_now timestamptz;
  v_start timestamptz;
  v_count integer;
  v_points integer;
  v_share akasha_ai.social_shares%ROWTYPE;
  v_journal akasha_ai.point_transactions%ROWTYPE;
  v_before akasha_ai.purama_points%ROWTYPE;
  v_balance akasha_ai.purama_points%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_share_code IS NULL OR p_share_code = ''
    OR p_platform_hint IS NULL OR p_platform_hint NOT IN
      ('whatsapp', 'telegram', 'twitter', 'facebook', 'linkedin', 'email', 'sms', 'native')
  THEN RAISE EXCEPTION 'invalid share request' USING ERRCODE = '22023'; END IF;

  -- One profile lock serializes the per-user daily limit and first-share bonus.
  SELECT referral_code INTO v_code FROM akasha_ai.profiles WHERE id = v_actor FOR UPDATE;
  IF NOT FOUND OR v_code IS DISTINCT FROM p_share_code THEN
    RAISE EXCEPTION 'share profile mismatch' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();
  v_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM akasha_ai.social_shares
    WHERE user_id = v_actor AND shared_at >= v_start AND shared_at < v_start + interval '24 hours';

  SELECT * INTO v_share FROM akasha_ai.social_shares WHERE user_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_share.share_code IS DISTINCT FROM p_share_code OR v_share.platform_hint IS DISTINCT FROM p_platform_hint THEN
      RAISE EXCEPTION 'share request already used with different parameters' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('user_id', v_actor, 'request_id', p_request_id, 'share_id', v_share.id,
      'points', v_share.points_given, 'today_shares', v_count, 'replayed', true);
  END IF;

  IF v_count >= 3 THEN RAISE EXCEPTION 'maximum 3 shares per UTC day'; END IF;
  v_points := CASE WHEN v_count = 0 THEN 400 ELSE 300 END;
  SELECT * INTO v_before FROM akasha_ai.purama_points WHERE user_id = v_actor FOR UPDATE;
  INSERT INTO akasha_ai.social_shares(user_id, share_code, platform_hint, shared_at, points_given, request_id)
    VALUES(v_actor, v_code, p_platform_hint, v_now, v_points, p_request_id) RETURNING * INTO v_share;
  IF NOT FOUND OR v_share.id IS NULL OR v_share.user_id IS DISTINCT FROM v_actor
    OR v_share.share_code IS DISTINCT FROM v_code OR v_share.platform_hint IS DISTINCT FROM p_platform_hint
    OR v_share.shared_at IS DISTINCT FROM v_now OR v_share.points_given IS DISTINCT FROM v_points
    OR v_share.request_id IS DISTINCT FROM p_request_id
  THEN RAISE EXCEPTION 'share receipt was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO akasha_ai.point_transactions(user_id, amount, type, source, description)
    VALUES(v_actor, v_points, 'partage', 'share/' || v_share.id,
      'Partage ' || p_platform_hint || ' : +' || v_points || ' points') RETURNING * INTO v_journal;
  IF NOT FOUND OR v_journal.id IS NULL OR v_journal.user_id IS DISTINCT FROM v_actor
    OR v_journal.amount IS DISTINCT FROM v_points OR v_journal.type IS DISTINCT FROM 'partage'
    OR v_journal.source IS DISTINCT FROM 'share/' || v_share.id
    OR v_journal.description IS DISTINCT FROM 'Partage ' || p_platform_hint || ' : +' || v_points || ' points'
  THEN RAISE EXCEPTION 'share journal was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO akasha_ai.purama_points(user_id, balance, lifetime_earned)
    VALUES(v_actor, v_points, v_points)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = COALESCE(akasha_ai.purama_points.balance, 0) + EXCLUDED.balance,
      lifetime_earned = COALESCE(akasha_ai.purama_points.lifetime_earned, 0) + EXCLUDED.lifetime_earned
    RETURNING * INTO v_balance;
  IF NOT FOUND OR v_balance.user_id IS DISTINCT FROM v_actor
    OR v_balance.balance IS DISTINCT FROM coalesce(v_before.balance, 0) + v_points
    OR v_balance.lifetime_earned IS DISTINCT FROM coalesce(v_before.lifetime_earned, 0) + v_points
  THEN RAISE EXCEPTION 'share balance was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('user_id', v_actor, 'request_id', p_request_id, 'share_id', v_share.id,
    'points', v_points, 'today_shares', v_count + 1, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.record_social_share(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.record_social_share(uuid, text, text) TO authenticated;

ALTER TABLE akasha_ai.social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.purama_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.point_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_own_social_shares ON akasha_ai.social_shares;
CREATE POLICY users_own_social_shares ON akasha_ai.social_shares FOR SELECT TO authenticated USING(auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_points ON akasha_ai.purama_points;
CREATE POLICY users_own_points ON akasha_ai.purama_points FOR SELECT TO authenticated USING(auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_point_txns ON akasha_ai.point_transactions;
CREATE POLICY users_own_point_txns ON akasha_ai.point_transactions FOR SELECT TO authenticated USING(auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON akasha_ai.social_shares,
  akasha_ai.purama_points, akasha_ai.point_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON akasha_ai.social_shares, akasha_ai.purama_points, akasha_ai.point_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON akasha_ai.social_shares,
  akasha_ai.purama_points, akasha_ai.point_transactions TO service_role;

CREATE OR REPLACE FUNCTION akasha_ai.get_social_share_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_start timestamptz := date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_stats jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object('version', 1, 'user_id', v_actor,
    'total_shares', count(*), 'points_earned', coalesce(sum(points_given), 0),
    'today_shares', count(*) FILTER (WHERE shared_at >= v_start AND shared_at < v_start + interval '24 hours'))
    INTO v_stats FROM akasha_ai.social_shares WHERE user_id = v_actor;
  RETURN v_stats;
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.get_social_share_stats() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.get_social_share_stats() TO authenticated;

CREATE OR REPLACE FUNCTION akasha_ai.record_email_sequence_delivery(p_user_id uuid, p_email_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_receipt akasha_ai.email_sequences%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_email_type IS NULL OR p_email_type NOT IN
    ('welcome', 'tip_day1', 'relaunch_day3', 'tips_day7', 'upgrade_day14', 'testimonial_day21',
      'winback_day30', 'referral_event', 'contest_event', 'milestone_event')
  THEN RAISE EXCEPTION 'invalid email sequence' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM akasha_ai.email_sequences WHERE user_id = p_user_id AND email_type = p_email_type)
  THEN RETURN false; END IF;
  INSERT INTO akasha_ai.email_sequences(user_id, email_type) VALUES(p_user_id, p_email_type)
    RETURNING * INTO v_receipt;
  IF NOT FOUND OR v_receipt.id IS NULL OR v_receipt.user_id IS DISTINCT FROM p_user_id
    OR v_receipt.email_type IS DISTINCT FROM p_email_type
  THEN RAISE EXCEPTION 'email receipt was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.record_email_sequence_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.record_email_sequence_delivery(uuid, text) TO service_role;
DROP POLICY IF EXISTS users_own_email_sequences ON akasha_ai.email_sequences;
ALTER TABLE akasha_ai.email_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_email_sequences ON akasha_ai.email_sequences FOR SELECT TO authenticated USING(auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON akasha_ai.email_sequences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON akasha_ai.email_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON akasha_ai.email_sequences TO service_role;
-- Non-unique: historical duplicate confirmations remain available for reconciliation.
CREATE INDEX IF NOT EXISTS email_sequences_user_type_idx ON akasha_ai.email_sequences(user_id, email_type);
CREATE INDEX IF NOT EXISTS profiles_created_id_idx ON akasha_ai.profiles(created_at, id);
GRANT SELECT, INSERT ON akasha_ai.contact_messages TO service_role;

COMMIT;
