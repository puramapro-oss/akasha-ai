-- CASE: reward_rpc_and_table_acls
BEGIN;
DO $$ DECLARE relation text; client text; routine text; BEGIN
  FOREACH relation IN ARRAY ARRAY['social_shares','point_transactions','purama_points','daily_gifts',
    'user_coupons','lottery_tickets','point_purchases','email_sequences'] LOOP
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM reward_test.check_true(NOT has_table_privilege(client,'akasha_ai.'||relation,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),relation||' table rights closed');
      PERFORM reward_test.check_true(NOT has_any_column_privilege(client,'akasha_ai.'||relation,'INSERT,UPDATE,REFERENCES'),relation||' column rights closed');
    END LOOP;
  END LOOP;
  FOREACH routine IN ARRAY ARRAY['akasha_ai.claim_daily_gift(uuid,text,integer,integer)',
    'akasha_ai.redeem_points_reward(uuid,integer,text,uuid)','akasha_ai.record_email_sequence_delivery(uuid,text)'] LOOP
    PERFORM reward_test.check_true(has_function_privilege('service_role',routine,'EXECUTE'),'service RPC retained');
    PERFORM reward_test.check_true(NOT has_function_privilege('anon',routine,'EXECUTE') AND NOT has_function_privilege('authenticated',routine,'EXECUTE'),'client RPC closed');
  END LOOP;
  PERFORM reward_test.check_true(NOT has_function_privilege('service_role','akasha_ai.redeem_points(uuid,integer,text)','EXECUTE'),'debit-only path stays closed');
  PERFORM reward_test.check_true((SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='akasha_ai' AND p.proname='claim_daily_gift'),'no daily gift overload');
END; $$;
ROLLBACK;


-- CASE: checked_share_actor_binding
BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.reject($sql$SELECT akasha_ai.record_social_share_checked(reward_test.uid(901),'fixture-'||reward_test.uid(1)::text,'whatsapp',reward_test.uid(2))$sql$,'42501','session mismatch before award');
SELECT reward_test.check_true(akasha_ai.record_social_share_checked(reward_test.uid(901),'fixture-'||reward_test.uid(1)::text,'whatsapp',reward_test.uid(1))->>'points'='400','checked receipt contract');
ROLLBACK;


-- CASE: email_confirmation_boolean_and_legacy_duplicates
BEGIN; SET LOCAL ROLE service_role;
SELECT reward_test.check_true(akasha_ai.record_email_sequence_delivery(reward_test.uid(1),'welcome'),'first persisted confirmation is true');
SELECT reward_test.check_true(NOT akasha_ai.record_email_sequence_delivery(reward_test.uid(1),'welcome'),'existing confirmation returns false');
INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES(reward_test.uid(2),'welcome'),(reward_test.uid(2),'welcome');
SELECT reward_test.check_true(NOT akasha_ai.record_email_sequence_delivery(reward_test.uid(2),'welcome'),'legacy duplicate pair is preserved');
SELECT reward_test.check_true((SELECT count(*)=3 FROM akasha_ai.email_sequences),'no third legacy record');
SELECT reward_test.reject($sql$SELECT akasha_ai.record_email_sequence_delivery(reward_test.uid(1),'invented')$sql$,'22023','unknown email type refused');
ROLLBACK;


-- CASE: reward_reads_own_history_only
BEGIN; SET LOCAL ROLE service_role;
SELECT reward_test.gift('coupon',20);
SELECT akasha_ai.record_email_sequence_delivery(reward_test.uid(1),'welcome');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.daily_gifts),'one own gift visible');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.user_coupons),'one own coupon visible');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.email_sequences),'own email receipt visible');
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.lottery_tickets),'foreign ticket hidden');
ROLLBACK;


-- CASE: reward_inherited_dml_and_spoofed_claims_denied
BEGIN;
CREATE ROLE reward_legacy_writer NOLOGIN;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON akasha_ai.purama_points,akasha_ai.daily_gifts,akasha_ai.email_sequences TO reward_legacy_writer;
GRANT USAGE ON SCHEMA akasha_ai,auth,reward_test TO reward_legacy_writer;
GRANT reward_legacy_writer TO authenticated;
CREATE POLICY fixture_permissive ON akasha_ai.daily_gifts FOR ALL USING(true) WITH CHECK(true);
CREATE POLICY fixture_permissive ON akasha_ai.purama_points FOR ALL USING(true) WITH CHECK(true);
CREATE POLICY fixture_permissive ON akasha_ai.email_sequences FOR ALL USING(true) WITH CHECK(true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role='service_role';
SELECT reward_test.reject($sql$UPDATE akasha_ai.purama_points SET balance=99999 WHERE user_id=reward_test.uid(1)$sql$,'42501','inherited balance writes blocked');
SELECT reward_test.reject($sql$DELETE FROM akasha_ai.daily_gifts$sql$,'42501','inherited receipt erasure blocked');
SELECT reward_test.reject($sql$INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES(reward_test.uid(1),'welcome')$sql$,'42501','inherited email forgery blocked');
SELECT reward_test.reject($sql$TRUNCATE akasha_ai.daily_gifts$sql$,'42501','inherited truncate blocked');
SET LOCAL ROLE reward_legacy_writer;
SELECT reward_test.reject($sql$UPDATE akasha_ai.purama_points SET balance=99999 WHERE user_id=reward_test.uid(1)$sql$,'42501','unrecognized effective writer not trusted');
ROLLBACK;

-- CASE: composition_gift_share_purchase
BEGIN;
UPDATE akasha_ai.purama_points SET balance=10000 WHERE user_id=reward_test.uid(1);
SET LOCAL ROLE service_role; SELECT reward_test.gift(); RESET ROLE;
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'; SELECT reward_test.share(); RESET ROLE;
SET LOCAL ROLE service_role; SELECT reward_test.purchase(); RESET ROLE;
SELECT reward_test.check_true((SELECT balance=8405 AND lifetime_earned=705 FROM akasha_ai.purama_points WHERE user_id=reward_test.uid(1)),'three relative effects compose');
SELECT reward_test.check_true((SELECT credits=10 FROM akasha_ai.profiles WHERE id=reward_test.uid(1)),'purchase credits delivered');
SELECT reward_test.check_true((SELECT count(*)=3 AND sum(amount)=-1595 FROM akasha_ai.point_transactions),'three journals agree');
ROLLBACK;
