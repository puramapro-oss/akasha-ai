-- Exact table definition from puramapro-oss/midas, migrations/v4.1-connect-withdrawals.sql
-- Git blob 64cbb5e72f44ba325df15a333a820382b7aa8d69; verified against GitHub on 2026-11-22.
CREATE TABLE IF NOT EXISTS public.connect_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  stripe_transfer_id TEXT UNIQUE,
  amount_eur NUMERIC(12,2) NOT NULL CHECK (amount_eur >= 20),
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'reversed')),
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
