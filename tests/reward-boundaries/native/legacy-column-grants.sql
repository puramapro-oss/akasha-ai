-- Synthetic pre-existing column grants/policies. Applied before the four
-- published migrations, so this tests historical rights that table REVOKE
-- does not remove. No real instance or external role is changed by the fixture.
GRANT UPDATE(role,credits),INSERT(id,role),REFERENCES(id) ON akasha_ai.profiles TO PUBLIC,anon,authenticated;
GRANT UPDATE(points_given),REFERENCES(id) ON akasha_ai.social_shares TO PUBLIC,anon,authenticated;
GRANT UPDATE(amount),REFERENCES(id) ON akasha_ai.point_transactions TO PUBLIC,anon,authenticated;
GRANT UPDATE(balance),REFERENCES(id) ON akasha_ai.purama_points TO PUBLIC,anon,authenticated;
GRANT UPDATE(gift_value),REFERENCES(id) ON akasha_ai.daily_gifts TO PUBLIC,anon,authenticated;
GRANT UPDATE(discount_percent),REFERENCES(id) ON akasha_ai.user_coupons TO PUBLIC,anon,authenticated;
GRANT UPDATE(source),REFERENCES(id) ON akasha_ai.lottery_tickets TO PUBLIC,anon,authenticated;
GRANT UPDATE(points_spent),REFERENCES(id) ON akasha_ai.point_purchases TO PUBLIC,anon,authenticated;
GRANT UPDATE(email_type),REFERENCES(id) ON akasha_ai.email_sequences TO PUBLIC,anon,authenticated;
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['social_shares','point_transactions','purama_points',
    'daily_gifts','user_coupons','lottery_tickets','point_purchases','email_sequences'] LOOP
    EXECUTE format('CREATE POLICY legacy_fixture_rewards ON akasha_ai.%I FOR ALL USING(auth.uid()=user_id)',relation);
  END LOOP;
END; $$;
