-- Preserve settings/onboarding edits while account privileges and balances stay server-owned.
-- The auth-user trigger and service_role keep provisioning and reward delivery.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON akasha_ai.profiles FROM PUBLIC, anon, authenticated;
-- Remove prior column grants too; table-level REVOKE alone does not remove them.
DO $$
DECLARE column_name text;
BEGIN
  FOR column_name IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'akasha_ai.profiles'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON akasha_ai.profiles FROM PUBLIC, anon, authenticated',
      column_name, column_name);
  END LOOP;
END;
$$;
GRANT SELECT ON akasha_ai.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, pseudo, bio, preferred_language, accent_color,
  interests, onboarding_completed, onboarding_use_case, onboarding_level, tutorial_completed, updated_at)
  ON akasha_ai.profiles TO authenticated;
COMMIT;
