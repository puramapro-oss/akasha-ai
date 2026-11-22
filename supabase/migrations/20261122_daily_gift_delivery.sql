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
  v_coupon akasha_ai.user_coupons%ROWTYPE;
  v_gift akasha_ai.daily_gifts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'invalid gift owner' USING ERRCODE = '42501';
  END IF;
  -- Same first lock as social sharing: no balance read followed by an absolute overwrite.
  PERFORM 1 FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE = '23503'; END IF;
  v_now := clock_timestamp();
  v_day := (v_now AT TIME ZONE 'UTC')::date;
  v_start := v_day::timestamp AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM akasha_ai.daily_gifts
    WHERE user_id = p_user_id AND (gift_date = v_day OR (opened_at >= v_start AND opened_at < v_start + interval '1 day'));
  IF v_count > 1 THEN RAISE EXCEPTION 'ambiguous historical gifts' USING ERRCODE = 'P0002'; END IF;
  IF v_count = 1 THEN
    SELECT * INTO v_gift FROM akasha_ai.daily_gifts
      WHERE user_id = p_user_id AND (gift_date = v_day OR (opened_at >= v_start AND opened_at < v_start + interval '1 day'));
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
  IF p_gift_type IS NULL OR p_gift_value IS NULL OR NOT (
    (p_gift_type = 'points' AND (p_gift_value BETWEEN 5 AND 20 OR p_gift_value BETWEEN 50 AND 100))
    OR (p_gift_type = 'credits' AND p_gift_value = 3)
    OR (p_gift_type = 'ticket' AND p_gift_value = 1)
    OR (p_gift_type = 'coupon' AND (p_gift_value BETWEEN 5 AND 10 OR p_gift_value = 20
      OR (p_gift_value = 50 AND v_streak >= 7)))
  ) THEN RAISE EXCEPTION 'invalid gift outcome' USING ERRCODE = '22023'; END IF;

  INSERT INTO akasha_ai.daily_gifts(user_id, gift_type, gift_value, streak_count, opened_at, gift_date)
    VALUES(p_user_id, p_gift_type, p_gift_value::text, v_streak, v_now, v_day) RETURNING * INTO v_gift;
  IF p_gift_type = 'points' THEN
    INSERT INTO akasha_ai.point_transactions(user_id, amount, type, source, description)
      VALUES(p_user_id, p_gift_value, 'daily_gift', 'daily_gift/' || v_gift.id,
        'Coffre quotidien : +' || p_gift_value || ' points');
    INSERT INTO akasha_ai.purama_points(user_id, balance, lifetime_earned)
      VALUES(p_user_id, p_gift_value, p_gift_value)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = coalesce(akasha_ai.purama_points.balance, 0) + EXCLUDED.balance,
        lifetime_earned = coalesce(akasha_ai.purama_points.lifetime_earned, 0) + EXCLUDED.lifetime_earned;
  ELSIF p_gift_type = 'credits' THEN
    UPDATE akasha_ai.profiles SET credits = coalesce(credits, 0) + p_gift_value WHERE id = p_user_id;
  ELSIF p_gift_type = 'coupon' THEN
    INSERT INTO akasha_ai.user_coupons(user_id, code, discount_percent, source, expires_at)
      VALUES(p_user_id, 'DAILY' || p_gift_value || '-' || v_gift.id, p_gift_value, 'daily',
        NULL) RETURNING * INTO v_coupon;
  ELSIF p_gift_type = 'ticket' THEN
    SELECT id INTO v_draw FROM akasha_ai.lottery_draws
      WHERE status = 'upcoming' AND draw_date > v_now ORDER BY draw_date, id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no eligible lottery draw' USING ERRCODE = '55000'; END IF;
    INSERT INTO akasha_ai.lottery_tickets(user_id, draw_id, source) VALUES(p_user_id, v_draw, 'daily_gift');
  END IF;
  -- A local coupon record is not a usable Stripe discount. Preserve the prize
  -- and its reference, but do not claim activation before that integration exists.
  UPDATE akasha_ai.daily_gifts SET
    fulfilled_at = CASE WHEN p_gift_type = 'coupon' THEN NULL ELSE v_now END,
    delivery_status = CASE WHEN p_gift_type = 'coupon' THEN 'pending_coupon_activation' ELSE 'delivered' END,
    delivery_details = CASE WHEN p_gift_type = 'coupon' THEN
      jsonb_build_object('coupon_id', v_coupon.id, 'code', v_coupon.code,
        'discount_percent', v_coupon.discount_percent, 'expires_at', v_coupon.expires_at,
        'valid_for_days', CASE WHEN p_gift_value >= 50 THEN 1 WHEN p_gift_value >= 20 THEN 3 ELSE 7 END) ELSE NULL END
    WHERE id = v_gift.id RETURNING * INTO v_gift;
  RETURN jsonb_build_object('gift', to_jsonb(v_gift), 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.claim_daily_gift(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.claim_daily_gift(uuid, text, integer, integer) TO service_role;
REVOKE INSERT, UPDATE, DELETE ON akasha_ai.daily_gifts, akasha_ai.user_coupons, akasha_ai.lottery_tickets FROM anon, authenticated;
COMMIT;
