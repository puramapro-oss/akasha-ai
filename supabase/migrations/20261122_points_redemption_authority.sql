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
  v_purchase akasha_ai.point_purchases%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'invalid redemption owner or request' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
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

  UPDATE akasha_ai.purama_points SET balance = balance - v_price
    WHERE user_id = p_user_id AND balance >= v_price RETURNING balance INTO v_balance;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points'); END IF;
  IF v_type = 'credits' THEN
    UPDATE akasha_ai.profiles SET credits = coalesce(credits, 0) + v_value WHERE id = p_user_id;
  ELSE
    INSERT INTO akasha_ai.lottery_tickets(user_id, draw_id, source)
      VALUES(p_user_id, v_draw, 'boutique/' || p_request_id) RETURNING id INTO v_reference;
  END IF;
  INSERT INTO akasha_ai.point_transactions(user_id, amount, type, source, description)
    VALUES(p_user_id, -v_price, 'redeem', 'boutique/' || p_request_id, 'Achat boutique: ' || p_item_id);
  INSERT INTO akasha_ai.point_purchases(user_id, points_spent, request_id, item_code,
      fulfillment_type, fulfillment_value, fulfillment_reference)
    VALUES(p_user_id, v_price, p_request_id, p_item_id, v_type, v_value, v_reference) RETURNING * INTO v_purchase;
  RETURN jsonb_build_object('success', true, 'request_id', p_request_id, 'user_id', p_user_id,
    'purchase_id', v_purchase.id, 'item_id', p_item_id, 'cost_points', v_price, 'new_balance', v_balance,
    'fulfilled', true, 'replayed', false, 'fulfillment_type', v_type, 'fulfillment_value', v_value,
    'fulfillment_reference', v_reference);
END;
$$;
REVOKE ALL ON FUNCTION akasha_ai.redeem_points_reward(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.redeem_points_reward(uuid, integer, text, uuid) TO service_role;
DROP POLICY IF EXISTS users_own_purchases ON akasha_ai.point_purchases;
CREATE POLICY users_own_purchases ON akasha_ai.point_purchases FOR SELECT USING(auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON akasha_ai.point_purchases, akasha_ai.lottery_tickets FROM anon, authenticated;
COMMIT;
