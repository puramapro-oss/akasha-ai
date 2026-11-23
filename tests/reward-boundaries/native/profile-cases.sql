-- CASE: profile_real_rls_precondition
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.check_true('akasha_ai.profiles'::regclass::oid>=16384 AND 'akasha_ai.streaks'::regclass::oid>=16384,'ordinary relation OIDs');
SELECT reward_test.check_true(current_user='authenticated' AND (SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user),'ordinary effective role');
SELECT reward_test.check_true(row_security_active('akasha_ai.profiles') AND row_security_active('akasha_ai.streaks'),'RLS active for both inputs');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.profiles) AND (SELECT count(*)=1 FROM akasha_ai.streaks),'one of eight profiles and streaks visible');
ROLLBACK;

-- CASE: profile_protects_id
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET id=reward_test.uid(90) WHERE id=reward_test.uid(1)$sql$,'42501','protected id');
ROLLBACK;

-- CASE: profile_protects_email
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET email='forged@example.invalid' WHERE id=reward_test.uid(1)$sql$,'42501','protected email');
ROLLBACK;

-- CASE: profile_protects_level
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET level=99 WHERE id=reward_test.uid(1)$sql$,'42501','protected level');
ROLLBACK;

-- CASE: profile_protects_xp
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET xp=9999 WHERE id=reward_test.uid(1)$sql$,'42501','protected xp');
ROLLBACK;

-- CASE: profile_protects_xp_title
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET xp_title='Forged title' WHERE id=reward_test.uid(1)$sql$,'42501','protected xp_title');
ROLLBACK;

-- CASE: profile_protects_plan
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET plan='complete' WHERE id=reward_test.uid(1)$sql$,'42501','protected plan');
ROLLBACK;

-- CASE: profile_protects_plan_tier
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET plan_tier='max' WHERE id=reward_test.uid(1)$sql$,'42501','protected plan_tier');
ROLLBACK;

-- CASE: profile_protects_role
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET role='super_admin' WHERE id=reward_test.uid(1)$sql$,'42501','protected role');
ROLLBACK;

-- CASE: profile_protects_stripe_customer_id
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET stripe_customer_id='cus_forged' WHERE id=reward_test.uid(1)$sql$,'42501','protected stripe_customer_id');
ROLLBACK;

-- CASE: profile_protects_stripe_subscription_id
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET stripe_subscription_id='sub_forged' WHERE id=reward_test.uid(1)$sql$,'42501','protected stripe_subscription_id');
ROLLBACK;

-- CASE: profile_protects_wallet_balance
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET wallet_balance=9999 WHERE id=reward_test.uid(1)$sql$,'42501','protected wallet_balance');
ROLLBACK;

-- CASE: profile_protects_referral_code
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET referral_code='forged-referral' WHERE id=reward_test.uid(1)$sql$,'42501','protected referral_code');
ROLLBACK;

-- CASE: profile_protects_daily_questions
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET daily_questions=999 WHERE id=reward_test.uid(1)$sql$,'42501','protected daily_questions');
ROLLBACK;

-- CASE: profile_protects_streak_count
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET streak_count=365 WHERE id=reward_test.uid(1)$sql$,'42501','protected streak_count');
ROLLBACK;

-- CASE: profile_protects_credits
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET credits=9999 WHERE id=reward_test.uid(1)$sql$,'42501','protected credits');
ROLLBACK;

-- CASE: profile_protects_metadata
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET metadata='{"role":"super_admin","credits":9999}'::jsonb WHERE id=reward_test.uid(1)$sql$,'42501','protected metadata');
ROLLBACK;

-- CASE: profile_protects_subscription_started_at
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET subscription_started_at='2000-01-01Z' WHERE id=reward_test.uid(1)$sql$,'42501','protected subscription_started_at');
ROLLBACK;

-- CASE: profile_protects_created_at
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET created_at='2000-01-01Z' WHERE id=reward_test.uid(1)$sql$,'42501','protected created_at');
ROLLBACK;

-- CASE: profile_existing_ui_fields_are_editable
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
UPDATE akasha_ai.profiles SET display_name='Synthetic name',avatar_url='https://example.invalid/avatar.png',
  pseudo='synthetic-pseudo',bio='Synthetic bio',onboarding_completed=true,
  onboarding_use_case='personal',onboarding_level='beginner',interests=ARRAY['science','art'],
  preferred_language='fr',accent_color='violet',tutorial_completed=true,updated_at='2000-01-01Z'
WHERE id=reward_test.uid(1);
SELECT reward_test.check_true((SELECT display_name='Synthetic name' AND avatar_url='https://example.invalid/avatar.png'
  AND pseudo='synthetic-pseudo' AND bio='Synthetic bio' AND onboarding_completed AND onboarding_use_case='personal'
  AND onboarding_level='beginner' AND interests=ARRAY['science','art'] AND preferred_language='fr'
  AND accent_color='violet' AND tutorial_completed AND updated_at>'2000-01-01Z'
  AND role='user' AND credits=0 AND metadata='{}'::jsonb
  FROM akasha_ai.profiles WHERE id=reward_test.uid(1)),'actual UI fields persist and timestamp trigger retained');
ROLLBACK;

-- CASE: profile_cross_user_read_and_update_filtered
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.profiles WHERE id=reward_test.uid(2)),'foreign profile filtered');
DO $$ DECLARE changed integer; BEGIN
  UPDATE akasha_ai.profiles SET display_name='Wrong account' WHERE id=reward_test.uid(2);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Other account updated'; END IF;
END; $$;
ROLLBACK;

-- CASE: profile_insert_upsert_delete_and_truncate_denied
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$INSERT INTO akasha_ai.profiles(id,email,role) VALUES(reward_test.uid(1),'forged@example.invalid','super_admin') ON CONFLICT(id) DO UPDATE SET role=excluded.role$sql$,'42501','profile upsert');
SELECT reward_test.reject($sql$DELETE FROM akasha_ai.profiles WHERE id=reward_test.uid(1)$sql$,'42501','profile delete cannot erase child receipts');
SELECT reward_test.reject($sql$TRUNCATE akasha_ai.profiles CASCADE$sql$,'42501','profile truncate cannot erase reward history');
ROLLBACK;

-- CASE: streak_write_and_reset_denied
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.streaks SET current_streak=7,longest_streak=999,last_active_date=current_date WHERE user_id=reward_test.uid(1)$sql$,'42501','cannot qualify for seven-day rewards');
SELECT reward_test.reject($sql$INSERT INTO akasha_ai.streaks(user_id,current_streak) VALUES(reward_test.uid(1),999) ON CONFLICT(user_id) DO UPDATE SET current_streak=excluded.current_streak$sql$,'42501','streak upsert');
SELECT reward_test.reject($sql$DELETE FROM akasha_ai.streaks WHERE user_id=reward_test.uid(1)$sql$,'42501','streak delete');
SELECT reward_test.reject($sql$TRUNCATE akasha_ai.streaks$sql$,'42501','streak truncate');
ROLLBACK;

-- CASE: profile_column_allowlist_is_exact
SELECT reward_test.check_true(NOT EXISTS(
  SELECT 1 FROM pg_attribute WHERE attrelid='akasha_ai.profiles'::regclass AND attnum>0 AND NOT attisdropped
    AND has_column_privilege('authenticated',attrelid,attnum,'UPDATE') IS DISTINCT FROM
      (attname=ANY(ARRAY['display_name','avatar_url','pseudo','bio','onboarding_completed','onboarding_use_case','onboarding_level',
        'interests','preferred_language','accent_color','tutorial_completed','updated_at']))
),'only twelve UI columns are granted');
SELECT reward_test.check_true(NOT has_any_column_privilege('authenticated','akasha_ai.streaks','UPDATE,INSERT'),'no client streak writes');
SELECT reward_test.check_true(NOT EXISTS(
  SELECT 1 FROM (VALUES('anon'),('authenticated')) r(name), (VALUES('akasha_ai.profiles'),('akasha_ai.streaks')) t(name)
  WHERE has_table_privilege(r.name,t.name,'TRIGGER,REFERENCES,TRUNCATE') OR has_any_column_privilege(r.name,t.name,'REFERENCES')
),'no structural client rights');

-- CASE: profile_service_writes_preserved
BEGIN; SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role='authenticated';
UPDATE akasha_ai.profiles SET role='admin',plan='premium',plan_tier='advanced',email='verified@example.invalid',
  stripe_customer_id='cus_verified',stripe_subscription_id='sub_verified',wallet_balance=10,credits=7,xp=10,level=2,
  referral_code='verified-referral',metadata='{"server_verified":true}',subscription_started_at=now() WHERE id=reward_test.uid(1);
UPDATE akasha_ai.streaks SET current_streak=7,longest_streak=7,last_active_date=current_date WHERE user_id=reward_test.uid(1);
SELECT reward_test.check_true((SELECT role='admin' AND credits=7 AND metadata->>'server_verified'='true' FROM akasha_ai.profiles WHERE id=reward_test.uid(1)),'trusted profile writer preserved');
SELECT reward_test.check_true((SELECT current_streak=7 FROM akasha_ai.streaks WHERE user_id=reward_test.uid(1)),'trusted streak writer preserved');
ROLLBACK;

-- CASE: profile_signup_and_account_erasure_preserved
BEGIN;
INSERT INTO auth.users(id,email) VALUES(reward_test.uid(12),'profile-signup@example.invalid');
SELECT reward_test.check_true((SELECT role='user' AND credits=0 FROM akasha_ai.profiles WHERE id=reward_test.uid(12)),'signup trusted defaults');
SELECT reward_test.check_true((SELECT current_streak=0 FROM akasha_ai.streaks WHERE user_id=reward_test.uid(12)),'signup streak');
DELETE FROM auth.users WHERE id=reward_test.uid(2);
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.profiles WHERE id=reward_test.uid(2)),'trusted profile cascade');
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.daily_gifts WHERE user_id=reward_test.uid(2)),'trusted gift cascade');
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.user_coupons WHERE user_id=reward_test.uid(2)),'trusted coupon cascade');
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.lottery_tickets WHERE user_id=reward_test.uid(2)),'trusted ticket cascade');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.profiles WHERE id=reward_test.uid(1)),'other user preserved');
ROLLBACK;

-- CASE: profile_auth_trigger_not_client_attachable
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE client_signup_source(id uuid,email text,raw_user_meta_data jsonb);
SELECT reward_test.reject($sql$CREATE TRIGGER forged_signup AFTER INSERT ON client_signup_source FOR EACH ROW EXECUTE FUNCTION akasha_ai.handle_new_user()$sql$,'42501','privileged signup trigger not exposed');
SELECT reward_test.check_true(NOT has_function_privilege('anon','akasha_ai.handle_new_user()','EXECUTE'),'anonymous trigger execution removed');
ROLLBACK;

-- CASE: profile_unknown_future_field_fails_closed
BEGIN;
ALTER TABLE akasha_ai.profiles ADD COLUMN future_authority_flag boolean NOT NULL DEFAULT false;
GRANT UPDATE(future_authority_flag) ON akasha_ai.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET future_authority_flag=true WHERE id=reward_test.uid(1)$sql$,'42501','unknown field protected despite direct grant');
UPDATE akasha_ai.profiles SET display_name='Future safe edit' WHERE id=reward_test.uid(1);
ROLLBACK;

-- CASE: profile_inherited_row_grants_and_policies_remain_bounded
BEGIN;
CREATE ROLE profile_legacy_writer NOLOGIN;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON akasha_ai.profiles,akasha_ai.streaks TO profile_legacy_writer;
GRANT USAGE ON SCHEMA akasha_ai,auth,reward_test TO profile_legacy_writer;
GRANT profile_legacy_writer TO authenticated;
CREATE POLICY profile_fixture_permissive ON akasha_ai.profiles FOR ALL TO authenticated,profile_legacy_writer USING(true) WITH CHECK(true);
CREATE POLICY streak_fixture_permissive ON akasha_ai.streaks FOR ALL TO authenticated,profile_legacy_writer USING(true) WITH CHECK(true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role='service_role';
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET role='super_admin',credits=999 WHERE id=reward_test.uid(1)$sql$,'42501','inherited authority grant');
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET display_name='Wrong owner' WHERE id=reward_test.uid(2)$sql$,'42501','permissive foreign update');
SELECT reward_test.reject($sql$DELETE FROM akasha_ai.profiles WHERE id=reward_test.uid(1)$sql$,'42501','inherited parent delete cannot erase receipts');
SELECT reward_test.reject($sql$UPDATE akasha_ai.streaks SET current_streak=7 WHERE user_id=reward_test.uid(1)$sql$,'42501','inherited streak grant');
SELECT reward_test.reject($sql$TRUNCATE akasha_ai.profiles CASCADE$sql$,'42501','inherited parent truncate');
UPDATE akasha_ai.profiles SET display_name='Own safe edit' WHERE id=reward_test.uid(1);
SET LOCAL ROLE profile_legacy_writer;
SELECT reward_test.reject($sql$UPDATE akasha_ai.profiles SET role='super_admin' WHERE id=reward_test.uid(1)$sql$,'42501','unknown effective role not trusted');
ROLLBACK;

-- CASE: profile_anonymous_access_denied
BEGIN; SET LOCAL ROLE anon;
SELECT reward_test.reject($sql$SELECT * FROM akasha_ai.profiles$sql$,'42501','anonymous profiles not exposed');
SELECT reward_test.reject($sql$UPDATE akasha_ai.streaks SET current_streak=7$sql$,'42501','anonymous streak write');
ROLLBACK;

-- CASE: profile_history_preserved
SELECT reward_test.check_true((SELECT value=reward_test.state() FROM reward_test.snapshot),'profile gates and migration preserve history');
