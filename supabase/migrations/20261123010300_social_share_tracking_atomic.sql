-- Forward consolidation of the incoming delivery contract. One request_id,
-- one canonical writer, and one transaction for the share, ledger and balance.
-- A share receipt proves an intention/device hand-off, not social publication.
BEGIN;

ALTER TABLE akasha_ai.social_shares ADD COLUMN IF NOT EXISTS tracking_transaction_id uuid
  REFERENCES akasha_ai.point_transactions(id);
CREATE INDEX IF NOT EXISTS point_transactions_share_source_idx
  ON akasha_ai.point_transactions(user_id, source) WHERE type = 'partage';

-- Keep the incoming global write boundary, including non-share point types.
ALTER TABLE akasha_ai.social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.purama_points ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON akasha_ai.social_shares, akasha_ai.point_transactions,
  akasha_ai.purama_points FROM PUBLIC, anon, authenticated;

-- The unpublished candidate used a second identity and did not update the
-- spendable balance. It must not coexist with the canonical public entry point.
DROP FUNCTION IF EXISTS akasha_ai.track_social_share(uuid,uuid,text,text);

CREATE OR REPLACE FUNCTION akasha_ai.record_social_share(
  p_request_id uuid, p_share_code text, p_platform_hint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  canonical_code text;
  existing akasha_ai.social_shares%ROWTYPE;
  transaction_row akasha_ai.point_transactions%ROWTYPE;
  account_row akasha_ai.purama_points%ROWTYPE;
  persisted_share akasha_ai.social_shares%ROWTYPE;
  persisted_transaction akasha_ai.point_transactions%ROWTYPE;
  persisted_account akasha_ai.purama_points%ROWTYPE;
  at_time timestamptz;
  day_start timestamptz;
  today_count bigint;
  final_count bigint;
  receipt_count bigint;
  awarded integer;
  expected_balance integer;
  expected_lifetime integer;
  replayed boolean := false;
  share_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_platform_hint IS NULL OR p_platform_hint NOT IN
    ('whatsapp','telegram','twitter','facebook','linkedin','email','sms','native')
    OR p_share_code IS NULL OR length(p_share_code) NOT BETWEEN 1 AND 128 OR btrim(p_share_code) <> p_share_code THEN
    RAISE EXCEPTION 'invalid share request' USING ERRCODE = '22023';
  END IF;

  -- Gift delivery and shop redemption take the same first lock.
  SELECT referral_code INTO canonical_code FROM akasha_ai.profiles WHERE id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'share profile mismatch' USING ERRCODE = '42501'; END IF;
  at_time := clock_timestamp();
  day_start := ((at_time AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC';
  SELECT count(*) INTO today_count FROM akasha_ai.social_shares
    WHERE user_id = actor AND shared_at >= day_start AND shared_at < day_start + interval '24 hours';
  SELECT * INTO existing FROM akasha_ai.social_shares
    WHERE user_id = actor AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.platform_hint IS DISTINCT FROM p_platform_hint OR existing.share_code IS DISTINCT FROM p_share_code THEN
      RAISE EXCEPTION 'share_operation_conflict: share request already used with different parameters' USING ERRCODE = '22023';
    END IF;
    -- Incoming confirmed rows have request_id and source=share/<id>, but no FK.
    -- Resolve their exact existing receipt; never recredit or rewrite history.
    SELECT count(*) INTO receipt_count FROM akasha_ai.point_transactions
      WHERE user_id = actor AND type = 'partage' AND source = 'share/' || existing.id;
    IF receipt_count <> 1 THEN RAISE EXCEPTION 'share_receipt_incomplete' USING ERRCODE = '55000'; END IF;
    SELECT * INTO transaction_row FROM akasha_ai.point_transactions
      WHERE user_id = actor AND type = 'partage' AND source = 'share/' || existing.id FOR SHARE;
    IF transaction_row.amount IS DISTINCT FROM existing.points_given
      OR existing.points_given NOT IN (300,400)
      OR (existing.tracking_transaction_id IS NOT NULL AND existing.tracking_transaction_id <> transaction_row.id) THEN
      RAISE EXCEPTION 'share_receipt_incomplete' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO account_row FROM akasha_ai.purama_points WHERE user_id = actor FOR UPDATE;
    IF NOT FOUND OR account_row.balance IS NULL OR account_row.balance < 0
      OR account_row.lifetime_earned IS NULL OR account_row.lifetime_earned < existing.points_given THEN
      RAISE EXCEPTION 'share_balance_unconfirmed' USING ERRCODE = '55000';
    END IF;
    replayed := true;
  ELSE
    IF canonical_code IS DISTINCT FROM p_share_code THEN
      RAISE EXCEPTION 'share profile mismatch' USING ERRCODE = '42501';
    END IF;
    IF today_count >= 3 THEN
      RAISE EXCEPTION 'maximum 3 shares per UTC day' USING ERRCODE = 'P0001';
    END IF;
    awarded := CASE WHEN today_count = 0 THEN 400 ELSE 300 END;
    SELECT * INTO account_row FROM akasha_ai.purama_points WHERE user_id = actor FOR UPDATE;
    expected_balance := COALESCE(account_row.balance, 0) + awarded;
    expected_lifetime := COALESCE(account_row.lifetime_earned, 0) + awarded;
    IF expected_balance < awarded OR expected_lifetime < awarded THEN
      RAISE EXCEPTION 'share_balance_unconfirmed' USING ERRCODE = '55000';
    END IF;
    INSERT INTO akasha_ai.point_transactions(id,user_id,amount,type,source,description,created_at)
      VALUES (transaction_id,actor,awarded,'partage','share/' || share_id,
        'Partage ' || p_platform_hint || ' : +' || awarded || ' points',at_time)
      RETURNING * INTO transaction_row;
    IF NOT FOUND OR transaction_row.id IS DISTINCT FROM transaction_id OR transaction_row.user_id IS DISTINCT FROM actor
      OR transaction_row.amount IS DISTINCT FROM awarded OR transaction_row.type IS DISTINCT FROM 'partage'
      OR transaction_row.source IS DISTINCT FROM ('share/' || share_id) OR transaction_row.created_at IS DISTINCT FROM at_time
      OR transaction_row.description IS DISTINCT FROM ('Partage ' || p_platform_hint || ' : +' || awarded || ' points') THEN
      RAISE EXCEPTION 'share_transaction_mismatch' USING ERRCODE = '55000';
    END IF;
    INSERT INTO akasha_ai.social_shares(id,user_id,share_code,platform_hint,shared_at,points_given,
      request_id,tracking_transaction_id)
      VALUES (share_id,actor,p_share_code,p_platform_hint,at_time,awarded,p_request_id,transaction_id)
      RETURNING * INTO existing;
    IF NOT FOUND OR existing.id IS DISTINCT FROM share_id OR existing.user_id IS DISTINCT FROM actor
      OR existing.share_code IS DISTINCT FROM p_share_code OR existing.platform_hint IS DISTINCT FROM p_platform_hint
      OR existing.shared_at IS DISTINCT FROM at_time OR existing.points_given IS DISTINCT FROM awarded
      OR existing.request_id IS DISTINCT FROM p_request_id OR existing.tracking_transaction_id IS DISTINCT FROM transaction_id THEN
      RAISE EXCEPTION 'share_receipt_mismatch' USING ERRCODE = '55000';
    END IF;
    INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned)
      VALUES(actor,awarded,awarded)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = COALESCE(akasha_ai.purama_points.balance,0) + EXCLUDED.balance,
        lifetime_earned = COALESCE(akasha_ai.purama_points.lifetime_earned,0) + EXCLUDED.lifetime_earned
      RETURNING * INTO account_row;
    IF NOT FOUND OR account_row.id IS NULL OR account_row.user_id IS DISTINCT FROM actor
      OR account_row.balance IS DISTINCT FROM expected_balance OR account_row.lifetime_earned IS DISTINCT FROM expected_lifetime THEN
      RAISE EXCEPTION 'share_balance_unconfirmed' USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Verify all three persisted effects after the last write and its triggers.
  SELECT * INTO persisted_share FROM akasha_ai.social_shares WHERE id = existing.id FOR SHARE;
  IF NOT FOUND OR persisted_share IS DISTINCT FROM existing THEN
    RAISE EXCEPTION 'share_receipt_not_persisted' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO persisted_transaction FROM akasha_ai.point_transactions WHERE id = transaction_row.id FOR SHARE;
  IF NOT FOUND OR persisted_transaction IS DISTINCT FROM transaction_row THEN
    RAISE EXCEPTION 'share_transaction_not_persisted' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO persisted_account FROM akasha_ai.purama_points WHERE user_id = actor FOR SHARE;
  IF NOT FOUND OR persisted_account IS DISTINCT FROM account_row THEN
    RAISE EXCEPTION 'share_balance_not_persisted' USING ERRCODE = '55000';
  END IF;
  SELECT count(*) INTO receipt_count FROM akasha_ai.point_transactions
    WHERE user_id = actor AND type = 'partage' AND source = 'share/' || existing.id;
  SELECT count(*) INTO final_count FROM akasha_ai.social_shares
    WHERE user_id = actor AND shared_at >= day_start AND shared_at < day_start + interval '24 hours';
  IF receipt_count <> 1 OR final_count <> today_count + (CASE WHEN replayed THEN 0 ELSE 1 END) THEN
    RAISE EXCEPTION 'share_receipt_incomplete' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('user_id',actor,'request_id',p_request_id,'share_id',existing.id,
    'points',existing.points_given,'today_shares',final_count,'replayed',replayed,
    'transaction_id',transaction_row.id,'share_code',existing.share_code,
    'platform_id',existing.platform_hint,'shared_at',existing.shared_at);
END;
$$;

-- Keep the incoming versioned, actor-bound zero-argument aggregate. Remove
-- the unpublished overload so PostgREST has one unambiguous stats contract.
DROP FUNCTION IF EXISTS akasha_ai.get_social_share_stats(uuid);

REVOKE ALL ON FUNCTION akasha_ai.record_social_share(uuid,text,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION akasha_ai.get_social_share_stats() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.record_social_share(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.get_social_share_stats() TO authenticated;
COMMIT;
