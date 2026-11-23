-- Historical regression fixture only. Never apply to a real database.
-- Verbatim function from puramapro-oss/akasha-ai commit
-- 4123b25b80b0105003a6e71f61322565ea034633,
-- supabase/migrations/20261122_delivery_consistency.sql.
-- Extract SHA256: 8e6fb65a41e64be36ae6305a544eeb68a5459b93357ceccf2157832a68fffb43
CREATE OR REPLACE FUNCTION akasha_ai.record_email_sequence_delivery(p_user_id uuid, p_email_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR p_email_type IS NULL OR p_email_type NOT IN
    ('welcome', 'tip_day1', 'relaunch_day3', 'tips_day7', 'upgrade_day14', 'testimonial_day21',
      'winback_day30', 'referral_event', 'contest_event', 'milestone_event')
  THEN RAISE EXCEPTION 'invalid email sequence' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM akasha_ai.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM akasha_ai.email_sequences WHERE user_id = p_user_id AND email_type = p_email_type)
  THEN RETURN false; END IF;
  INSERT INTO akasha_ai.email_sequences(user_id, email_type) VALUES(p_user_id, p_email_type);
  RETURN true;
END;
$$;
