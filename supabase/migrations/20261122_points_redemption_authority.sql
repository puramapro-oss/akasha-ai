-- Preserve the existing catalogue and purchase table. Only implemented rewards can debit points.
-- Apply before deploying the API; the legacy debit-without-delivery function is closed.
BEGIN;
ALTER TABLE akasha_ai.point_purchases ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE akasha_ai.point_purchases ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE akasha_ai.point_purchases ADD COLUMN IF NOT EXISTS fulfillment_type text;
ALTER TABLE akasha_ai.point_purchases ADD COLUMN IF NOT EXISTS fulfillment_value integer;
ALTER TABLE akasha_ai.point_purchases ADD COLUMN IF NOT EXISTS fulfillment_reference uuid;
CREATE UNIQUE INDEX IF NOT EXISTS point_purchases_user_request_unique
  ON akasha_ai.point_purchases(user_id, request_id) WHERE request_id IS NOT NULL;

-- Old clients receive a refusal; no path may debit without delivering its reward.
CREATE OR REPLACE FUNCTION akasha_ai.redeem_points(p_user_id uuid, p_cost integer, p_item_id text)
RETURNS TABLE(new_balance integer, success boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT NULL::integer, false $$;
REVOKE ALL ON FUNCTION akasha_ai.redeem_points(uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION akasha_ai.redeem_points_reward(
  p_user_id uuid, p_cost integer, p_item_id text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_price integer;
  v_value integer;
  v_type text;
  v_balance integer;
  v_draw uuid;
  v_reference uuid;
  v_credits_before integer;
  v_credits integer;
  v_profile_id uuid;
  v_before akasha_ai.purama_points%ROWTYPE;
  v_points akasha_ai.purama_points%ROWTYPE;
  v_ticket akasha_ai.lottery_tickets%ROWTYPE;
  v_journal akasha_ai.point_transactions%ROWTYPE;
  v_purchase akasha_ai.point_purchases%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'invalid redemption owner or request' USING ERRCODE = '42501';
  END IF;
  SELECT credits INTO v_credits_before FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE = '23503'; END IF;

  SELECT * INTO v_purchase FROM akasha_ai.point_purchases
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_purchase.item_code IS DISTINCT FROM p_item_id OR v_purchase.points_spent IS DISTINCT FROM p_cost THEN
      RAISE EXCEPTION 'redemption request already used with different parameters' USING ERRCODE = '22023';
    END IF;
    SELECT balance INTO v_balance FROM akasha_ai.purama_points WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', true, 'request_id', p_request_id, 'user_id', p_user_id,
      'purchase_id', v_purchase.id, 'item_id', v_purchase.item_code, 'cost_points', v_purchase.points_spent,
      'new_balance', coalesce(v_balance, 0), 'fulfilled', true, 'replayed', true,
      'fulfillment_type', v_purchase.fulfillment_type, 'fulfillment_value', v_purchase.fulfillment_value,
      'fulfillment_reference', v_purchase.fulfillment_reference);
  END IF;

  -- Exact prices already defined by the existing catalogue; the API shares the same list.
  CASE p_item_id
    WHEN 'credits-10' THEN v_price := 2000; v_value := 10; v_type := 'credits';
    WHEN 'credits-50' THEN v_price := 8000; v_value := 50; v_type := 'credits';
    WHEN 'ticket-1' THEN v_price := 500; v_value := 1; v_type := 'ticket';
    ELSE RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
  END CASE;
  IF p_cost IS DISTINCT FROM v_price THEN RETURN jsonb_build_object('success', false, 'reason', 'price_changed'); END IF;
  IF v_type = 'ticket' THEN
    SELECT id INTO v_draw FROM akasha_ai.lottery_draws
      WHERE status = 'upcoming' AND draw_date > clock_timestamp() ORDER BY draw_date, id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'no_draw'); END IF;
  END IF;

  SELECT * INTO v_before FROM akasha_ai.purama_points WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR coalesce(v_before.balance, 0) < v_price THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points');
  END IF;
  UPDATE akasha_ai.purama_points SET balance = balance - v_price
    WHERE user_id = p_user_id AND balance >= v_price RETURNING * INTO v_points;
  IF NOT FOUND OR v_points.id IS DISTINCT FROM v_before.id OR v_points.user_id IS DISTINCT FROM p_user_id
    OR v_points.balance IS DISTINCT FROM v_before.balance - v_price
    OR v_points.lifetime_earned IS DISTINCT FROM v_before.lifetime_earned
  THEN RAISE EXCEPTION 'redemption debit was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  v_balance := v_points.balance;
  IF v_type = 'credits' THEN
    UPDATE akasha_ai.profiles SET credits = coalesce(credits, 0) + v_value WHERE id = p_user_id
      RETURNING id, credits INTO v_profile_id, v_credits;
    IF NOT FOUND OR v_profile_id IS DISTINCT FROM p_user_id
      OR v_credits IS DISTINCT FROM coalesce(v_credits_before, 0) + v_value
    THEN RAISE EXCEPTION 'redemption credits were suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  ELSE
    INSERT INTO akasha_ai.lottery_tickets(user_id, draw_id, source)
      VALUES(p_user_id, v_draw, 'boutique/' || p_request_id) RETURNING * INTO v_ticket;
    IF NOT FOUND OR v_ticket.id IS NULL OR v_ticket.user_id IS DISTINCT FROM p_user_id
      OR v_ticket.draw_id IS DISTINCT FROM v_draw OR v_ticket.source IS DISTINCT FROM 'boutique/' || p_request_id
    THEN RAISE EXCEPTION 'redemption ticket was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
    v_reference := v_ticket.id;
  END IF;
  INSERT INTO akasha_ai.point_transactions(user_id, amount, type, source, description)
    VALUES(p_user_id, -v_price, 'redeem', 'boutique/' || p_request_id, 'Achat boutique: ' || p_item_id)
    RETURNING * INTO v_journal;
  IF NOT FOUND OR v_journal.id IS NULL OR v_journal.user_id IS DISTINCT FROM p_user_id
    OR v_journal.amount IS DISTINCT FROM -v_price OR v_journal.type IS DISTINCT FROM 'redeem'
    OR v_journal.source IS DISTINCT FROM 'boutique/' || p_request_id
    OR v_journal.description IS DISTINCT FROM 'Achat boutique: ' || p_item_id
  THEN RAISE EXCEPTION 'redemption journal was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO akasha_ai.point_purchases(user_id, points_spent, request_id, item_code,
      fulfillment_type, fulfillment_value, fulfillment_reference)
    VALUES(p_user_id, v_price, p_request_id, p_item_id, v_type, v_value, v_reference) RETURNING * INTO v_purchase;
  IF NOT FOUND OR v_purchase.id IS NULL OR v_purchase.user_id IS DISTINCT FROM p_user_id
    OR v_purchase.points_spent IS DISTINCT FROM v_price OR v_purchase.request_id IS DISTINCT FROM p_request_id
    OR v_purchase.item_code IS DISTINCT FROM p_item_id OR v_purchase.fulfillment_type IS DISTINCT FROM v_type
    OR v_purchase.fulfillment_value IS DISTINCT FROM v_value OR v_purchase.fulfillment_reference IS DISTINCT FROM v_reference
  THEN RAISE EXCEPTION 'redemption receipt was suppressed or changed' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('success', true, 'request_id', p_request_id, 'user_id', p_user_id,
    'purchase_id', v_purchase.id, 'item_id', v_purchase.item_code, 'cost_points', v_purchase.points_spent,
    'new_balance', v_balance, 'fulfilled', true, 'replayed', false,
    'fulfillment_type', v_purchase.fulfillment_type, 'fulfillment_value', v_purchase.fulfillment_value,
    'fulfillment_reference', v_purchase.fulfillment_reference);
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.redeem_points_reward(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.redeem_points_reward(uuid, integer, text, uuid) TO service_role;
DROP POLICY IF EXISTS users_own_purchases ON akasha_ai.point_purchases;
ALTER TABLE akasha_ai.point_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.lottery_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_purchases ON akasha_ai.point_purchases FOR SELECT TO authenticated USING(auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_lottery_tickets ON akasha_ai.lottery_tickets;
CREATE POLICY users_own_lottery_tickets ON akasha_ai.lottery_tickets FOR SELECT TO authenticated USING(auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON akasha_ai.point_purchases, akasha_ai.lottery_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON akasha_ai.point_purchases, akasha_ai.lottery_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON akasha_ai.point_purchases, akasha_ai.lottery_tickets TO service_role;
COMMIT;
