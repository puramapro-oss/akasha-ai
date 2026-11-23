-- Append-only hardening after the four published 20261122 delivery migrations.
-- Keep the 78a RPC bodies, receipts, coupon-pending state and prices unchanged.
-- No historical reward is rewritten, reconciled or credited by this migration.
BEGIN;

DO $prerequisites$
DECLARE revision record;
BEGIN
  IF to_regprocedure('akasha_ai.record_social_share(uuid,text,text)') IS NULL
    OR to_regprocedure('akasha_ai.claim_daily_gift(uuid,text,integer,integer)') IS NULL
    OR to_regprocedure('akasha_ai.redeem_points_reward(uuid,integer,text,uuid)') IS NULL
    OR to_regprocedure('akasha_ai.record_email_sequence_delivery(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Published delivery migrations must precede reward boundaries' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('akasha_ai.claim_daily_gift(uuid,text,text,integer,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unreconciled alternate daily gift RPC exists' USING ERRCODE='55000';
  END IF;
  -- These published filenames also existed at 4123 with earlier bodies. A
  -- migration ledger alone therefore cannot prove the RETURNING safeguards.
  -- Fingerprints are md5(pg_proc.prosrc), extracted verbatim from 78a4b9da.
  -- Refuse an old/unknown revision; do not overwrite a concurrently installed RPC.
  FOR revision IN SELECT * FROM (VALUES
    ('akasha_ai.record_social_share(uuid,text,text)', '9de25abf2a3117376ad1d84a5d576de3'),
    ('akasha_ai.claim_daily_gift(uuid,text,integer,integer)', '30b20752c691c9e8b53dacd3e5f2630d'),
    ('akasha_ai.redeem_points_reward(uuid,integer,text,uuid)', '383b6626f07c3685f433dd5c9a6788aa'),
    ('akasha_ai.record_email_sequence_delivery(uuid,text)', 'eb253de58347d00e155b82f75f122f8c'),
    ('akasha_ai.get_social_share_stats()', '7e9d18266b34e102d03dd20608a643ad')
  ) AS required(signature, source_md5) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
      WHERE oid=to_regprocedure(revision.signature) AND md5(prosrc)=revision.source_md5) THEN
      RAISE EXCEPTION 'Published reward RPC revision mismatch: %. Apply the reviewed 78a4b9da revision before reward boundaries.',
        revision.signature USING ERRCODE='55000';
    END IF;
  END LOOP;
END;
$prerequisites$;

REVOKE ALL ON TABLE akasha_ai.profiles, akasha_ai.streaks FROM PUBLIC, anon, authenticated;
DO $columns$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT c.relname, string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) AS columns
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'akasha_ai' AND c.relname IN ('profiles', 'streaks')
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE akasha_ai.%I FROM PUBLIC, anon, authenticated',
      relation.columns, relation.relname);
  END LOOP;
END;
$columns$;
DO $structural$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace,
      (VALUES ('anon'), ('authenticated')) AS clients(name)
    WHERE n.nspname = 'akasha_ai' AND c.relname IN ('profiles', 'streaks')
      AND (has_table_privilege(clients.name, c.oid, 'TRIGGER,REFERENCES')
        OR has_any_column_privilege(clients.name, c.oid, 'REFERENCES'))
  ) THEN
    RAISE EXCEPTION 'Profile client roles retain inherited structural privileges' USING ERRCODE = '42501';
  END IF;
END;
$structural$;

GRANT SELECT ON TABLE akasha_ai.profiles, akasha_ai.streaks TO authenticated;
GRANT UPDATE(display_name, avatar_url, pseudo, bio, onboarding_completed,
  onboarding_use_case, onboarding_level, interests, preferred_language,
  accent_color, tutorial_completed, updated_at) ON akasha_ai.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE akasha_ai.profiles, akasha_ai.streaks TO service_role;

ALTER TABLE akasha_ai.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_own_profile ON akasha_ai.profiles;
DROP POLICY IF EXISTS users_own_profile_select ON akasha_ai.profiles;
DROP POLICY IF EXISTS users_own_profile_update ON akasha_ai.profiles;
CREATE POLICY users_own_profile_select ON akasha_ai.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY users_own_profile_update ON akasha_ai.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS users_own_streaks ON akasha_ai.streaks;
CREATE POLICY users_own_streaks ON akasha_ai.streaks FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION akasha_ai.guard_profile_reward_inputs()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $guard$
DECLARE
  editable CONSTANT text[] := ARRAY[
    'display_name', 'avatar_url', 'pseudo', 'bio', 'onboarding_completed',
    'onboarding_use_case', 'onboarding_level', 'interests', 'preferred_language',
    'accent_color', 'tutorial_completed', 'updated_at'
  ];
BEGIN
  -- Auth signup and SECURITY DEFINER RPCs run as their trusted owner. Never
  -- derive server authority from caller-controlled JWT settings or metadata.
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
    AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID) THEN
    IF current_user = 'authenticated' AND TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' THEN
      IF NEW.id IS NOT DISTINCT FROM auth.uid() AND OLD.id IS NOT DISTINCT FROM auth.uid()
        AND (to_jsonb(NEW) - editable) IS NOT DISTINCT FROM (to_jsonb(OLD) - editable) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Profile authority and reward inputs require a trusted writer' USING ERRCODE = '42501';
  END IF;
  IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION akasha_ai.guard_profile_reward_inputs() FROM PUBLIC, anon, authenticated;
-- Keep the installed auth trigger, without exposing its privileged body as a
-- trigger that an untrusted caller could attach to a caller-owned table.
REVOKE ALL ON FUNCTION akasha_ai.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION akasha_ai.handle_new_user() TO service_role;
DO $auth_trigger_acl$
BEGIN
  IF has_function_privilege('anon', 'akasha_ai.handle_new_user()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'akasha_ai.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Auth signup trigger retains inherited client execution' USING ERRCODE = '42501';
  END IF;
END;
$auth_trigger_acl$;

DO $triggers$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['profiles', 'streaks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS profile_reward_inputs_guard ON akasha_ai.%I', relation);
    EXECUTE format('CREATE TRIGGER profile_reward_inputs_guard BEFORE INSERT OR UPDATE OR DELETE ON akasha_ai.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION akasha_ai.guard_profile_reward_inputs()', relation);
    EXECUTE format('DROP TRIGGER IF EXISTS profile_reward_inputs_truncate_guard ON akasha_ai.%I', relation);
    EXECUTE format('CREATE TRIGGER profile_reward_inputs_truncate_guard BEFORE TRUNCATE ON akasha_ai.%I '
      || 'FOR EACH STATEMENT EXECUTE FUNCTION akasha_ai.guard_profile_reward_inputs()', relation);
  END LOOP;
END;
$triggers$;

-- RLS alone does not cover TRUNCATE or inherited DML grants. Keep server and
-- SECURITY DEFINER writers; refuse untrusted effective roles, not JWT claims.
CREATE OR REPLACE FUNCTION akasha_ai.guard_reward_server_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
    AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=TG_RELID) THEN
    RAISE EXCEPTION 'Reward receipts require a trusted writer' USING ERRCODE='42501';
  END IF;
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION akasha_ai.guard_reward_server_writes() FROM PUBLIC,anon,authenticated;

DO $boundaries$
DECLARE relation text; field text; client text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['social_shares','point_transactions','purama_points',
    'daily_gifts','user_coupons','lottery_tickets','point_purchases','email_sequences'] LOOP
    EXECUTE format('ALTER TABLE akasha_ai.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('REVOKE ALL ON TABLE akasha_ai.%I FROM PUBLIC,anon,authenticated',relation);
    FOR field IN SELECT a.attname FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=format('akasha_ai.%I',relation)::regclass AND a.attnum>0 AND NOT a.attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE akasha_ai.%I FROM PUBLIC,anon,authenticated',field,relation);
    END LOOP;
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(client,format('akasha_ai.%I',relation),'TRIGGER,REFERENCES')
        OR has_any_column_privilege(client,format('akasha_ai.%I',relation),'REFERENCES') THEN
        RAISE EXCEPTION 'Reward client retains inherited structural privileges: %.%',client,relation USING ERRCODE='42501';
      END IF;
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE akasha_ai.%I TO authenticated',relation);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE akasha_ai.%I TO service_role',relation);
    EXECUTE format('DROP TRIGGER IF EXISTS reward_server_writes ON akasha_ai.%I',relation);
    EXECUTE format('CREATE TRIGGER reward_server_writes BEFORE INSERT OR UPDATE OR DELETE ON akasha_ai.%I FOR EACH ROW EXECUTE FUNCTION akasha_ai.guard_reward_server_writes()',relation);
    EXECUTE format('DROP TRIGGER IF EXISTS reward_server_truncate ON akasha_ai.%I',relation);
    EXECUTE format('CREATE TRIGGER reward_server_truncate BEFORE TRUNCATE ON akasha_ai.%I FOR EACH STATEMENT EXECUTE FUNCTION akasha_ai.guard_reward_server_writes()',relation);
  END LOOP;
END;
$boundaries$;
-- Keep the published three-argument RPC usable by existing clients, and add an
-- unambiguous actor-bound entry point for the updated client. No overload.
CREATE OR REPLACE FUNCTION akasha_ai.record_social_share_checked(
  p_request_id uuid,p_share_code text,p_platform_hint text,p_expected_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $checked$
BEGIN
  IF auth.uid() IS NULL OR p_expected_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AKASHA_SHARE_SESSION_MISMATCH' USING ERRCODE='42501';
  END IF;
  RETURN akasha_ai.record_social_share(p_request_id,p_share_code,p_platform_hint);
END;
$checked$;

DO $function_acls$
DECLARE routine text; client text;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'akasha_ai.claim_daily_gift(uuid,text,integer,integer)',
    'akasha_ai.redeem_points_reward(uuid,integer,text,uuid)',
    'akasha_ai.record_email_sequence_delivery(uuid,text)',
    'akasha_ai.handle_new_user()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',routine);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine);
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(client,routine,'EXECUTE') THEN
        RAISE EXCEPTION 'Server reward RPC retains inherited client execution: %',routine USING ERRCODE='42501';
      END IF;
    END LOOP;
  END LOOP;
  FOREACH routine IN ARRAY ARRAY[
    'akasha_ai.record_social_share(uuid,text,text)',
    'akasha_ai.record_social_share_checked(uuid,text,text,uuid)',
    'akasha_ai.get_social_share_stats()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',routine);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',routine);
    IF has_function_privilege('anon',routine,'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated reward RPC retains inherited anonymous execution: %',routine USING ERRCODE='42501';
    END IF;
  END LOOP;
  -- The published migration intentionally closes the former debit-only path.
  REVOKE ALL ON FUNCTION akasha_ai.redeem_points(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
  FOREACH client IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(client,'akasha_ai.redeem_points(uuid,integer,text)','EXECUTE') THEN
      RAISE EXCEPTION 'Legacy debit-only RPC retains inherited execution' USING ERRCODE='42501';
    END IF;
  END LOOP;
END;
$function_acls$;

COMMIT;
