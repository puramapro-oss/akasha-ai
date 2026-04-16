-- V7 SUPREME migration — cross-promo tracking + prime subscription flag
-- Date: 2026-04-16
-- Idempotent: safe à ré-appliquer.

SET search_path = akasha_ai, public;

-- 1) cross_promos : création complète + champs tracking V7 §15
CREATE TABLE IF NOT EXISTS akasha_ai.cross_promos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app  TEXT        NOT NULL,
  target_app  TEXT        NOT NULL,
  user_id     UUID        REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  coupon_code TEXT,
  used        BOOLEAN     DEFAULT false,
  clicked_at  TIMESTAMPTZ DEFAULT now(),
  converted   BOOLEAN     DEFAULT false,
  coupon_used TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Si la table existait déjà sans les champs V7, les ajouter maintenant.
ALTER TABLE akasha_ai.cross_promos
  ADD COLUMN IF NOT EXISTS clicked_at  TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS converted   BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_used TEXT;

CREATE INDEX IF NOT EXISTS idx_cross_promos_user
  ON akasha_ai.cross_promos(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_promos_source_target
  ON akasha_ai.cross_promos(source_app, target_app);
CREATE INDEX IF NOT EXISTS idx_cross_promos_converted
  ON akasha_ai.cross_promos(converted) WHERE converted = true;

-- RLS
ALTER TABLE akasha_ai.cross_promos ENABLE ROW LEVEL SECURITY;
DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'users_own_cross_promos'
                   AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_cross_promos ON akasha_ai.cross_promos
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $rls$;

-- 2) profiles : flag abonnement pour règle prime V7 §20 (retrait wallet bloqué 30j)
ALTER TABLE akasha_ai.profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_started
  ON akasha_ai.profiles(subscription_started_at)
  WHERE subscription_started_at IS NOT NULL;

-- 3) Vérification
DO $verif$
BEGIN
  RAISE NOTICE 'cross_promos columns: %',
    (SELECT array_agg(column_name::text ORDER BY ordinal_position)
     FROM information_schema.columns
     WHERE table_schema = 'akasha_ai' AND table_name = 'cross_promos');
  RAISE NOTICE 'profiles.subscription_started_at exists: %',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'akasha_ai'
             AND table_name = 'profiles'
             AND column_name = 'subscription_started_at');
END $verif$;
