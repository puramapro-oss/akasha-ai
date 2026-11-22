-- Explicit replacements for three upstream reward cases after the durable overlays.
-- The original published cases remain available for the pre-overlay fingerprint gates.

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
  FOREACH relation IN ARRAY ARRAY['withdrawal_requests','withdrawal_cancellations','email_sequence_deliveries'] LOOP
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM reward_test.check_true(NOT has_table_privilege(client,'akasha_ai.'||relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),relation||' private journal closed');
      PERFORM reward_test.check_true(NOT has_any_column_privilege(client,'akasha_ai.'||relation,'SELECT,INSERT,UPDATE,REFERENCES'),relation||' private columns closed');
    END LOOP;
    PERFORM reward_test.check_true(NOT has_table_privilege('service_role','akasha_ai.'||relation,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),relation||' service writes restricted to RPC');
    PERFORM reward_test.check_true(has_table_privilege('service_role','akasha_ai.'||relation,'SELECT')=(relation='email_sequence_deliveries'),relation||' documented service read contract');
  END LOOP;
  FOREACH routine IN ARRAY ARRAY['akasha_ai.claim_daily_gift(uuid,text,integer,integer)',
    'akasha_ai.redeem_points_reward(uuid,integer,text,uuid)',
    'akasha_ai.claim_email_sequence_delivery(uuid,text,uuid,text,text)',
    'akasha_ai.complete_email_sequence_delivery(uuid,text,uuid,text,text)',
    'akasha_ai.reconcile_email_sequence_delivery(uuid,text,uuid,text,text,text)',
    'public.reserve_akasha_withdrawal(uuid,uuid,numeric,numeric,text,text,jsonb,numeric)',
    'public.cancel_akasha_withdrawal(uuid,uuid)'] LOOP
    PERFORM reward_test.check_true(has_function_privilege('service_role',routine,'EXECUTE'),'service RPC retained');
    PERFORM reward_test.check_true(NOT has_function_privilege('anon',routine,'EXECUTE') AND NOT has_function_privilege('authenticated',routine,'EXECUTE'),'client RPC closed');
  END LOOP;
  PERFORM reward_test.check_true(NOT has_function_privilege('service_role','akasha_ai.record_email_sequence_delivery(uuid,text)','EXECUTE'),'unconfirmed recorder stays retired');
  PERFORM reward_test.check_true(NOT has_function_privilege('service_role','akasha_ai.redeem_points(uuid,integer,text)','EXECUTE'),'debit-only path stays closed');
  PERFORM reward_test.check_true(has_function_privilege('authenticated','akasha_ai.export_own_delivery_receipts()','EXECUTE') AND NOT has_function_privilege('anon','akasha_ai.export_own_delivery_receipts()','EXECUTE'),'private export belongs to authenticated owner');
  PERFORM reward_test.check_true((SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='akasha_ai' AND p.proname='claim_daily_gift'),'no daily gift overload');
END; $$;
ROLLBACK;

-- CASE: email_confirmation_boolean_and_legacy_duplicates
BEGIN; SET LOCAL ROLE service_role;
SELECT reward_test.reject($sql$SELECT akasha_ai.record_email_sequence_delivery(reward_test.uid(1),'welcome')$sql$,'42501','legacy recorder is retired');
INSERT INTO akasha_ai.notification_preferences(user_id,types)
  VALUES(reward_test.uid(1),'{"newsletter":true}'),(reward_test.uid(2),'{"newsletter":true}');
SELECT reward_test.check_true(akasha_ai.claim_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'daily-1@example.invalid')->>'status'='claimed','one durable admission');
SELECT reward_test.check_true(akasha_ai.complete_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'synthetic-boundary-email')->>'status'='sent','provider acknowledgement persisted');
SELECT reward_test.check_true(akasha_ai.complete_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'synthetic-boundary-email')->>'status'='sent','matching acknowledgement replays');
SELECT reward_test.check_true(akasha_ai.claim_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'daily-1@example.invalid')->>'status'='already_sent','confirmed admission cannot send again');
INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES(reward_test.uid(2),'welcome'),(reward_test.uid(2),'welcome');
SELECT reward_test.check_true(akasha_ai.claim_email_sequence_delivery(reward_test.uid(2),'welcome',reward_test.uid(902),repeat('b',64),'daily-2@example.invalid')->>'status'='reconciliation_required','legacy duplicate pair is preserved without new send');
SELECT reward_test.check_true((SELECT count(*)=3 FROM akasha_ai.email_sequences),'no third legacy record');
SELECT reward_test.reject($sql$SELECT akasha_ai.claim_email_sequence_delivery(reward_test.uid(1),'invented',reward_test.uid(903),repeat('a',64),'daily-1@example.invalid')$sql$,'22023','unknown email type refused');
ROLLBACK;

-- CASE: reward_reads_own_history_only
BEGIN; SET LOCAL ROLE service_role;
SELECT reward_test.gift('coupon',20);
INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES(reward_test.uid(1),'{"newsletter":true}');
SELECT akasha_ai.claim_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'daily-1@example.invalid');
SELECT akasha_ai.complete_email_sequence_delivery(reward_test.uid(1),'welcome',reward_test.uid(901),repeat('a',64),'synthetic-boundary-email');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.daily_gifts),'one own gift visible');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.user_coupons),'one own coupon visible');
SELECT reward_test.check_true((SELECT count(*)=1 FROM akasha_ai.email_sequences),'own email receipt visible');
SELECT reward_test.check_true((SELECT count(*)=0 FROM akasha_ai.lottery_tickets),'foreign ticket hidden');
SELECT reward_test.reject($sql$SELECT * FROM akasha_ai.email_sequence_deliveries$sql$,'42501','private delivery journal remains closed');
ROLLBACK;
