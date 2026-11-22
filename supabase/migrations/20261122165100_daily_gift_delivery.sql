-- Append-only upgrade: no historical gift or reward is deleted or credited again.
-- Apply before the matching API. Historical claims without a receipt require reconciliation.
BEGIN;
ALTER TABLE akasha_ai.daily_gifts ADD COLUMN IF NOT EXISTS gift_date date;
ALTER TABLE akasha_ai.daily_gifts ALTER COLUMN gift_date SET DEFAULT ((now() AT TIME ZONE 'UTC')::date);
ALTER TABLE akasha_ai.daily_gifts ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;
ALTER TABLE akasha_ai.daily_gifts ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE akasha_ai.daily_gifts ADD COLUMN IF NOT EXISTS delivery_details jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS daily_gifts_user_date_unique ON akasha_ai.daily_gifts(user_id, gift_date);

CREATE OR REPLACE FUNCTION akasha_ai.claim_daily_gift(
  p_user_id uuid, p_gift_type text, p_gift_value integer, p_streak_count integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz;
  v_day date;
  v_start timestamptz;
  v_streak integer;
  v_count integer;
  v_draw uuid;
  v_credits_before integer;
  v_credits integer;
  v_profile_id uuid;
  v_before akasha_ai.purama_points%ROWTYPE;
  v_points akasha_ai.purama_points%ROWTYPE;
  v_journal akasha_ai.point_transactions%ROWTYPE;
  v_ticket akasha_ai.lottery_tickets%ROWTYPE;
  v_coupon akasha_ai.user_coupons%ROWTYPE;
  v_gift akasha_ai.daily_gifts%ROWTYPE;
  v_delivered akasha_ai.daily_gifts%ROWTYPE;
  v_fulfilled_at timestamptz;
  v_status text;
  v_details jsonb;
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'invalid gift owner' USING ERRCODE = '42501';
  END IF;
  -- Same first lock as social sharing: no balance read followed by an absolute overwrite.
  SELECT credits INTO v_credits_before FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE = '23503'; END IF;
  v_now := clock_timestamp();
  v_day := (v_now AT TIME ZONE 'UTC')::date;
  v_start := v_day::timestamp AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM akasha_ai.daily_gifts
    WHERE user_id = p_user_id AND (gift_date = v_day OR (opened_at >= v_start AND opened_at < v_start + interval '24 hours'));
  IF v_count > 1 THEN RAISE EXCEPTION 'ambiguous historical gifts' USING ERRCODE = 'P0002'; END IF;
  IF v_count = 1 THEN
    SELECT * INTO v_gift FROM akasha_ai.daily_gifts
      WHERE user_id = p_user_id AND (gift_date = v_day OR (opened_at >= v_start AND opened_at < v_start + interval '24 hours'));
    IF v_gift.fulfilled_at IS NULL AND v_gift.delivery_status IS DISTINCT FROM 'pending_coupon_activation' THEN
      RAISE EXCEPTION 'historical gift requires reconciliation' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('gift', to_jsonb(v_gift), 'replayed', true);
  END IF;
  SELECT current_streak INTO v_streak FROM akasha_ai.streaks WHERE user_id = p_user_id;
  v_streak := coalesce(v_streak, 0);
  IF p_streak_count IS NULL OR p_streak_count <> v_streak THEN
    RAISE EXCEPTION 'streak changed before gift draw' USING ERRCODE = '40001';
  END IF;
  IF v_streak < 0 OR p_gift_type IS NULL OR p_gift_value IS NULL OR NOT (
    (p_gift_type = 'points' AND (p_gift_value BETWEEN 5 AND 20 OR p_gift_value BETWEEN 50 AND 100))
    OR (p_gift_type = 'credits' AND p_gift_value = 3)
    OR (p_gift_type = 'ticket' AND p_gift_value = 1)
    OR (p_gift_type = 'coupon' AND (p_gift_value IN (10, 20)
      OR (p_gift_value BETWEEN 5 AND 9 AND v_streak < 7)
      OR (p_gift_value = 50 AND v_streak >= 7)))
  ) THEN RAISE EXCEPTION 'invalid gift outcome' USING ERRCODE = '22023'; END IF;

  INSERT INTO akasha_ai.daily_gifts(user_id, gift_type, gift_value, streak_count, opened_at, gift_date)
    VALUES(p_user_id, p_gift_type, p_gift_value::text, v_streak, v_now, v_day) RETURNING * INTO v_gift;
  IF NOT FOUND OR v_gift.id IS NULL OR v_gift.user_id IS DISTINCT FROM p_user_id
    OR v_gift.gift_type IS DISTINCT FROM p_gift_type OR v_gift.gift_value IS DISTINCT FROM p_gift_value::text
    OR v_gift.streak_count IS DISTINCT FROM v_streak OR v_gift.opened_at IS DISTINCT FROM v_now
    OR v_gift.gift_date IS DISTINCT FROM v_day
  THEN RAISE EXCEPTION 'gift claim was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  IF p_gift_type = 'points' THEN
    SELECT * INTO v_before FROM akasha_ai.purama_points WHERE user_id = p_user_id FOR UPDATE;
    INSERT INTO akasha_ai.point_transactions(user_id, amount, type, source, description)
      VALUES(p_user_id, p_gift_value, 'daily_gift', 'daily_gift/' || v_gift.id,
        'Coffre quotidien : +' || p_gift_value || ' points') RETURNING * INTO v_journal;
    IF NOT FOUND OR v_journal.id IS NULL OR v_journal.user_id IS DISTINCT FROM p_user_id
      OR v_journal.amount IS DISTINCT FROM p_gift_value OR v_journal.type IS DISTINCT FROM 'daily_gift'
      OR v_journal.source IS DISTINCT FROM 'daily_gift/' || v_gift.id
      OR v_journal.description IS DISTINCT FROM 'Coffre quotidien : +' || p_gift_value || ' points'
    THEN RAISE EXCEPTION 'gift journal was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO akasha_ai.purama_points(user_id, balance, lifetime_earned)
      VALUES(p_user_id, p_gift_value, p_gift_value)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = coalesce(akasha_ai.purama_points.balance, 0) + EXCLUDED.balance,
        lifetime_earned = coalesce(akasha_ai.purama_points.lifetime_earned, 0) + EXCLUDED.lifetime_earned
      RETURNING * INTO v_points;
    IF NOT FOUND OR v_points.user_id IS DISTINCT FROM p_user_id
      OR v_points.balance IS DISTINCT FROM coalesce(v_before.balance, 0) + p_gift_value
      OR v_points.lifetime_earned IS DISTINCT FROM coalesce(v_before.lifetime_earned, 0) + p_gift_value
    THEN RAISE EXCEPTION 'gift balance was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  ELSIF p_gift_type = 'credits' THEN
    UPDATE akasha_ai.profiles SET credits = coalesce(credits, 0) + p_gift_value WHERE id = p_user_id
      RETURNING id, credits INTO v_profile_id, v_credits;
    IF NOT FOUND OR v_profile_id IS DISTINCT FROM p_user_id
      OR v_credits IS DISTINCT FROM coalesce(v_credits_before, 0) + p_gift_value
    THEN RAISE EXCEPTION 'gift credits were suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  ELSIF p_gift_type = 'coupon' THEN
    INSERT INTO akasha_ai.user_coupons(user_id, code, discount_percent, source, expires_at, used)
      VALUES(p_user_id, 'DAILY' || p_gift_value || '-' || v_gift.id, p_gift_value, 'daily',
        NULL, false) RETURNING * INTO v_coupon;
    IF NOT FOUND OR v_coupon.id IS NULL OR v_coupon.user_id IS DISTINCT FROM p_user_id
      OR v_coupon.code IS DISTINCT FROM 'DAILY' || p_gift_value || '-' || v_gift.id
      OR v_coupon.discount_percent IS DISTINCT FROM p_gift_value OR v_coupon.source IS DISTINCT FROM 'daily'
      OR v_coupon.expires_at IS NOT NULL OR v_coupon.used IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'pending gift coupon was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  ELSIF p_gift_type = 'ticket' THEN
    SELECT id INTO v_draw FROM akasha_ai.lottery_draws
      WHERE status = 'upcoming' AND draw_date > v_now ORDER BY draw_date, id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no eligible lottery draw' USING ERRCODE = '55000'; END IF;
    INSERT INTO akasha_ai.lottery_tickets(user_id, draw_id, source) VALUES(p_user_id, v_draw, 'daily_gift')
      RETURNING * INTO v_ticket;
    IF NOT FOUND OR v_ticket.id IS NULL OR v_ticket.user_id IS DISTINCT FROM p_user_id
      OR v_ticket.draw_id IS DISTINCT FROM v_draw OR v_ticket.source IS DISTINCT FROM 'daily_gift'
    THEN RAISE EXCEPTION 'gift ticket was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  END IF;
  -- A local coupon record is not a usable Stripe discount. Preserve the prize
  -- and its reference, but do not claim activation before that integration exists.
  v_fulfilled_at := CASE WHEN p_gift_type = 'coupon' THEN NULL ELSE v_now END;
  v_status := CASE WHEN p_gift_type = 'coupon' THEN 'pending_coupon_activation' ELSE 'delivered' END;
  v_details := CASE WHEN p_gift_type = 'coupon' THEN
      jsonb_build_object('coupon_id', v_coupon.id, 'code', v_coupon.code,
        'discount_percent', v_coupon.discount_percent, 'expires_at', v_coupon.expires_at,
        'valid_for_days', CASE WHEN p_gift_value >= 50 THEN 1 WHEN p_gift_value >= 20 THEN 3 ELSE 7 END) ELSE NULL END;
  UPDATE akasha_ai.daily_gifts SET fulfilled_at = v_fulfilled_at,
    delivery_status = v_status, delivery_details = v_details
    WHERE id = v_gift.id RETURNING * INTO v_delivered;
  IF NOT FOUND OR v_delivered.id IS DISTINCT FROM v_gift.id OR v_delivered.user_id IS DISTINCT FROM p_user_id
    OR v_delivered.gift_type IS DISTINCT FROM p_gift_type OR v_delivered.gift_value IS DISTINCT FROM p_gift_value::text
    OR v_delivered.streak_count IS DISTINCT FROM v_streak OR v_delivered.opened_at IS DISTINCT FROM v_now
    OR v_delivered.gift_date IS DISTINCT FROM v_day OR v_delivered.fulfilled_at IS DISTINCT FROM v_fulfilled_at
    OR v_delivered.delivery_status IS DISTINCT FROM v_status OR v_delivered.delivery_details IS DISTINCT FROM v_details
  THEN RAISE EXCEPTION 'gift delivery receipt was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('gift', to_jsonb(v_delivered), 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.claim_daily_gift(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.claim_daily_gift(uuid, text, integer, integer) TO service_role;
ALTER TABLE akasha_ai.daily_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.user_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.lottery_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_own_daily_gifts ON akasha_ai.daily_gifts;
CREATE POLICY users_own_daily_gifts ON akasha_ai.daily_gifts FOR SELECT TO authenticated USING(auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_coupons ON akasha_ai.user_coupons;
CREATE POLICY users_own_coupons ON akasha_ai.user_coupons FOR SELECT TO authenticated USING(auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_lottery_tickets ON akasha_ai.lottery_tickets;
CREATE POLICY users_own_lottery_tickets ON akasha_ai.lottery_tickets FOR SELECT TO authenticated USING(auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON akasha_ai.daily_gifts, akasha_ai.user_coupons, akasha_ai.lottery_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON akasha_ai.daily_gifts, akasha_ai.user_coupons, akasha_ai.lottery_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON akasha_ai.daily_gifts, akasha_ai.user_coupons, akasha_ai.lottery_tickets TO service_role;
COMMIT;
