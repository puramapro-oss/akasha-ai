-- =============================================================================
-- Migration : Claim atomique du cadeau quotidien (race condition — R1 red team)
-- BUG : src/app/api/daily-gift/route.ts POST faisait un check-then-act pur
--   (SELECT existingGift via fenêtre de date -> ... -> INSERT non protégé)
--   sans aucune contrainte DB. Deux requêtes concurrentes (double-clic,
--   2 onglets, replay) passaient toutes les deux le check et créditaient
--   CHACUNE des points/coupons/tickets de loterie réels (tables
--   point_transactions, user_coupons, lottery_tickets, purama_points).
-- FIX : colonne gift_date (jour calendaire du claim) + contrainte UNIQUE
--   (user_id, gift_date). La route doit tenter l'INSERT dans daily_gifts EN
--   PREMIER (avant tout octroi de récompense) et traiter le 23505 comme
--   "déjà réclamé aujourd'hui" — même pattern que webhook-idempotency.ts et
--   midas/supabase/migrations/009_daily_gift_atomic_claim.sql (fix jumeau).
-- Idempotent : vérifie l'état avant d'agir.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'akasha_ai' AND table_name = 'daily_gifts' AND column_name = 'gift_date'
  ) THEN
    ALTER TABLE akasha_ai.daily_gifts ADD COLUMN gift_date DATE NOT NULL DEFAULT (now()::date);
  END IF;
END $$;

-- Backfill défensif (lignes déjà existantes avant l'ajout de la colonne).
UPDATE akasha_ai.daily_gifts SET gift_date = opened_at::date WHERE gift_date IS DISTINCT FROM opened_at::date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_gifts_user_date_unique'
  ) THEN
    -- Purge des doublons historiques (dus au bug) avant de poser la contrainte,
    -- pour ne pas échouer la migration sur des données déjà corrompues.
    DELETE FROM akasha_ai.daily_gifts a
    USING akasha_ai.daily_gifts b
    WHERE a.user_id = b.user_id
      AND a.gift_date = b.gift_date
      AND a.opened_at > b.opened_at;

    ALTER TABLE akasha_ai.daily_gifts
      ADD CONSTRAINT daily_gifts_user_date_unique UNIQUE (user_id, gift_date);
  END IF;
END $$;
