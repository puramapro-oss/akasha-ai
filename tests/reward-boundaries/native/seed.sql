-- Synthetic identities only. Application tables/functions come from schema.sql.
CREATE SCHEMA reward_test;
GRANT USAGE ON SCHEMA reward_test TO anon, authenticated, service_role;
CREATE FUNCTION reward_test.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION reward_test.check_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END;
$$;
CREATE FUNCTION reward_test.reject(statement text, wanted_state text, label text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE denied boolean := false; observed text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE;
    IF observed IS DISTINCT FROM wanted_state THEN
      RAISE EXCEPTION 'Wrong rejection for %: expected %, observed %', label, wanted_state, observed;
    END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Expected rejection: %', label; END IF;
END;
$$;
INSERT INTO auth.users(id,email)
  SELECT reward_test.uid(n), 'daily-' || n::text || '@example.invalid' FROM generate_series(1,8) n;
UPDATE akasha_ai.profiles SET referral_code='fixture-'||id::text;
INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned)
  VALUES(reward_test.uid(1),100,300),(reward_test.uid(3),NULL,NULL);
INSERT INTO akasha_ai.daily_gifts(user_id,gift_type,gift_value,streak_count,opened_at,gift_date)
  VALUES(reward_test.uid(2),'points','17',0,now(),(now() AT TIME ZONE 'UTC')::date),
    (reward_test.uid(4),'points','10',0,now()-interval '2 days',(now() AT TIME ZONE 'UTC')::date-1);
INSERT INTO akasha_ai.user_coupons(user_id,code,discount_percent,source,expires_at)
  VALUES(reward_test.uid(2),'LEGACY-FIXTURE',5,'daily',now()+interval '7 days');
INSERT INTO akasha_ai.lottery_draws(id,draw_date,status)
  VALUES(reward_test.uid(801),now()-interval '1 day','completed'),
    (reward_test.uid(802),now()+interval '5 days','upcoming'),
    (reward_test.uid(803),now()+interval '2 days','upcoming');
INSERT INTO akasha_ai.lottery_tickets(user_id,draw_id,source)
  VALUES(reward_test.uid(2),reward_test.uid(803),'legacy_fixture');

CREATE FUNCTION reward_test.state() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM akasha_ai.profiles p),
    'streaks',(SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id) FROM akasha_ai.streaks s),
    'gifts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM akasha_ai.daily_gifts g),
    'points',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM akasha_ai.purama_points p),
    'journal',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM akasha_ai.point_transactions t),
    'coupons',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM akasha_ai.user_coupons c),
    'tickets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM akasha_ai.lottery_tickets t),
    'draws',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM akasha_ai.lottery_draws d),
    'purchases',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM akasha_ai.point_purchases p),
    'emails',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM akasha_ai.email_sequences e)
  )
$$;
CREATE TABLE reward_test.snapshot AS SELECT reward_test.state() AS value;
GRANT SELECT ON reward_test.snapshot TO service_role;

-- Domain helpers invoke the published RPC names and receipts.
CREATE FUNCTION reward_test.share(n integer DEFAULT 901) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT akasha_ai.record_social_share(reward_test.uid(n),'fixture-'||reward_test.uid(1)::text,'whatsapp')
$$;
CREATE FUNCTION reward_test.gift(kind text DEFAULT 'points',amount integer DEFAULT 5,streak integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT akasha_ai.claim_daily_gift(reward_test.uid(1),kind,amount,streak)
$$;
CREATE FUNCTION reward_test.purchase(item text DEFAULT 'credits-10',cost integer DEFAULT 2000,n integer DEFAULT 901)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT akasha_ai.redeem_points_reward(reward_test.uid(1),cost,item,reward_test.uid(n))
$$;
