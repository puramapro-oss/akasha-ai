-- packages/legal/sql/001_legal_core.sql
-- Socle légal partagé (NIYAMA-BRIEF.md §1) — 3 tables, communes à toute app de l'écosystème.
--
-- Remplacer akasha_ai par le schéma réel de l'app avant exécution, ex. :
--   sed 's/akasha_ai/pashu/g' packages/legal/sql/001_legal_core.sql > /tmp/pashu_legal.sql
--   $VPS_SSH "PGPASSWORD='...' psql -h localhost -p 5432 -U postgres -d postgres -f /dev/stdin" < /tmp/pashu_legal.sql
--
-- Convention écosystème : profiles.id = auth.users.id (1:1). Toute app "marketplace" au
-- schéma partagé `purama_marketplace` doit en plus filtrer par `app_id` sur ces 3 tables
-- (cf app.config.ts D-007) — non géré ici, à ajouter par l'app si applicable.
--
-- Idempotence : CREATE TABLE IF NOT EXISTS + CREATE POLICY enveloppée dans
-- DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$ (convention SKILLS/SUPABASE.md) —
-- ce script peut être rejoué sans erreur sur un schéma qui l'a déjà reçu.

-- 1. Preuve d'acceptation CGU/CGV/politique de confidentialité, versionnée et horodatée.
CREATE TABLE IF NOT EXISTS akasha_ai.legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('mentions', 'cgu', 'cgv', 'confidentialite')),
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_id_idx ON akasha_ai.legal_acceptances (user_id);

ALTER TABLE akasha_ai.legal_acceptances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY legal_acceptances_select_own ON akasha_ai.legal_acceptances
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY legal_acceptances_insert_own ON akasha_ai.legal_acceptances
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Consentement cookies — 1 ligne par utilisateur authentifié (le visiteur anonyme reste
--    en localStorage côté client, cf hooks/useCookieConsent.ts, et n'a pas de ligne ici).
CREATE TABLE IF NOT EXISTS akasha_ai.cookie_consents (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  necessaire BOOLEAN NOT NULL DEFAULT true,
  mesure BOOLEAN NOT NULL DEFAULT false,
  marketing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE akasha_ai.cookie_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY cookie_consents_select_own ON akasha_ai.cookie_consents
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY cookie_consents_insert_own ON akasha_ai.cookie_consents
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY cookie_consents_update_own ON akasha_ai.cookie_consents
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Demandes de suppression de compte avec période de grâce (RGPD art. 17).
--    Schéma identique à `arogya.account_deletion_requests` (implémentation réelle déjà en
--    production, réutilisée telle quelle) — ne pas renommer les colonnes, `api/account-delete.ts`
--    et `api/cron-account-deletion.ts` en dépendent tels quels.
CREATE TABLE IF NOT EXISTS akasha_ai.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executing', 'completed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
  ON akasha_ai.account_deletion_requests (status, scheduled_for);

ALTER TABLE akasha_ai.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY account_deletion_requests_select_own ON akasha_ai.account_deletion_requests
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY account_deletion_requests_insert_own ON akasha_ai.account_deletion_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY account_deletion_requests_update_own ON akasha_ai.account_deletion_requests
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le rôle service_role (utilisé par api/cron-account-deletion.ts) contourne RLS nativement,
-- aucune policy supplémentaire n'est nécessaire pour le sweep quotidien.
