-- AKASHA AI Schema
CREATE SCHEMA IF NOT EXISTS akasha_ai;

-- Profiles
CREATE TABLE IF NOT EXISTS akasha_ai.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  pseudo TEXT UNIQUE,
  bio TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  xp_title TEXT DEFAULT 'Explorateur',
  plan TEXT DEFAULT 'free',
  plan_tier TEXT DEFAULT 'essential',
  role TEXT DEFAULT 'user',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_use_case TEXT,
  onboarding_level TEXT,
  interests TEXT[] DEFAULT '{}',
  preferred_language TEXT DEFAULT 'fr',
  accent_color TEXT DEFAULT 'cyan',
  tutorial_completed BOOLEAN DEFAULT false,
  wallet_balance NUMERIC(10,2) DEFAULT 0,
  referral_code TEXT UNIQUE,
  daily_questions INTEGER DEFAULT 0,
  streak_count INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  subscription_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations
CREATE TABLE IF NOT EXISTS akasha_ai.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT DEFAULT 'claude-sonnet-4',
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages
CREATE TABLE IF NOT EXISTS akasha_ai.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES akasha_ai.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usage daily
CREATE TABLE IF NOT EXISTS akasha_ai.usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  chat_count INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  audio_count INTEGER DEFAULT 0,
  code_count INTEGER DEFAULT 0,
  api_count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- Agents
CREATE TABLE IF NOT EXISTS akasha_ai.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'claude-sonnet-4',
  triggers JSONB,
  is_active BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  price NUMERIC(10,2) DEFAULT 0,
  installs INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent installs
CREATE TABLE IF NOT EXISTS akasha_ai.agent_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES akasha_ai.agents(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- Agent reviews
CREATE TABLE IF NOT EXISTS akasha_ai.agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES akasha_ai.agents(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- Generations
CREATE TABLE IF NOT EXISTS akasha_ai.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT,
  result_url TEXT,
  result_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workflows
CREATE TABLE IF NOT EXISTS akasha_ai.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'paused',
  last_run TIMESTAMPTZ,
  cron_schedule TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Collab spaces
CREATE TABLE IF NOT EXISTS akasha_ai.collab_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.collab_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES akasha_ai.collab_spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'editor',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(space_id, user_id)
);

-- Collab messages (chat partage par espace)
CREATE TABLE IF NOT EXISTS akasha_ai.collab_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES akasha_ai.collab_spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collab_messages_space_id ON akasha_ai.collab_messages(space_id, created_at DESC);

-- Badges
CREATE TABLE IF NOT EXISTS akasha_ai.badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  xp_reward INTEGER DEFAULT 0,
  condition_type TEXT,
  condition_value INTEGER
);

CREATE TABLE IF NOT EXISTS akasha_ai.user_badges (
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  badge_id TEXT REFERENCES akasha_ai.badges(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- XP log
CREATE TABLE IF NOT EXISTS akasha_ai.xp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  xp_earned INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Streaks
CREATE TABLE IF NOT EXISTS akasha_ai.streaks (
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_active_date DATE
);

-- API keys
CREATE TABLE IF NOT EXISTS akasha_ai.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'Default',
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS akasha_ai.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES akasha_ai.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS akasha_ai.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  icon TEXT,
  type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wallets
CREATE TABLE IF NOT EXISTS akasha_ai.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC(10,2) DEFAULT 0,
  total_earned NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES akasha_ai.wallets(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS akasha_ai.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  stripe_payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'eur',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON akasha_ai.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON akasha_ai.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON akasha_ai.usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_agents_creator_id ON akasha_ai.agents(creator_id);
CREATE INDEX IF NOT EXISTS idx_agents_is_public ON akasha_ai.agents(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON akasha_ai.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_user_id ON akasha_ai.xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON akasha_ai.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON akasha_ai.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_started ON akasha_ai.profiles(subscription_started_at) WHERE subscription_started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cross_promos_user ON akasha_ai.cross_promos(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_promos_source_target ON akasha_ai.cross_promos(source_app, target_app);
CREATE INDEX IF NOT EXISTS idx_cross_promos_converted ON akasha_ai.cross_promos(converted) WHERE converted = true;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON akasha_ai.profiles(stripe_customer_id);

-- RLS
ALTER TABLE akasha_ai.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.agent_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.agent_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.collab_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.collab_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.xp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_profile' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_profile ON akasha_ai.profiles FOR ALL USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_conversations' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_conversations ON akasha_ai.conversations FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_messages' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_messages ON akasha_ai.messages FOR ALL USING (conversation_id IN (SELECT id FROM akasha_ai.conversations WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_usage' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_usage ON akasha_ai.usage_daily FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_agents' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_agents ON akasha_ai.agents FOR ALL USING (auth.uid() = creator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_see_public_agents' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_see_public_agents ON akasha_ai.agents FOR SELECT USING (is_public = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_installs' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_installs ON akasha_ai.agent_installs FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_reviews' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_reviews ON akasha_ai.agent_reviews FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_see_reviews' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_see_reviews ON akasha_ai.agent_reviews FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_generations' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_generations ON akasha_ai.generations FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_workflows' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_workflows ON akasha_ai.workflows FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_collab_spaces' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_collab_spaces ON akasha_ai.collab_spaces FOR ALL USING (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_badges' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_badges ON akasha_ai.user_badges FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_xp' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_xp ON akasha_ai.xp_log FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_streaks' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_streaks ON akasha_ai.streaks FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_api_keys' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_api_keys ON akasha_ai.api_keys FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_notifications' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_notifications ON akasha_ai.notifications FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_wallets' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_wallets ON akasha_ai.wallets FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_wallet_txns' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_wallet_txns ON akasha_ai.wallet_transactions FOR ALL USING (wallet_id IN (SELECT id FROM akasha_ai.wallets WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_payments' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_payments ON akasha_ai.payments FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Auto-create profile on signup trigger
CREATE OR REPLACE FUNCTION akasha_ai.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO akasha_ai.profiles (id, email, display_name, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    lower(substr(md5(random()::text), 1, 8))
  );
  INSERT INTO akasha_ai.wallets (user_id) VALUES (NEW.id);
  INSERT INTO akasha_ai.streaks (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_akasha ON auth.users;
CREATE TRIGGER on_auth_user_created_akasha
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION akasha_ai.handle_new_user();

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION akasha_ai.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_profiles_timestamp BEFORE UPDATE ON akasha_ai.profiles FOR EACH ROW EXECUTE FUNCTION akasha_ai.update_updated_at();
CREATE OR REPLACE TRIGGER update_conversations_timestamp BEFORE UPDATE ON akasha_ai.conversations FOR EACH ROW EXECUTE FUNCTION akasha_ai.update_updated_at();
CREATE OR REPLACE TRIGGER update_agents_timestamp BEFORE UPDATE ON akasha_ai.agents FOR EACH ROW EXECUTE FUNCTION akasha_ai.update_updated_at();

-- Seed super admin
INSERT INTO akasha_ai.profiles (id, email, display_name, role, plan, plan_tier, credits, daily_questions, xp, level, xp_title)
SELECT id, 'matiss.frasne@gmail.com', 'Tissma', 'super_admin', 'complete', 'max', 999999, 999999, 99999, 100, 'Akashique'
FROM auth.users WHERE email = 'matiss.frasne@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'super_admin', plan = 'complete', plan_tier = 'max', credits = 999999, daily_questions = 999999;

-- ═══════════════════════════════════════════════════════════════════════
-- V3 TABLES — Referral, Points, Achievements, Influencer, etc.
-- ═══════════════════════════════════════════════════════════════════════

-- Referrals
CREATE TABLE IF NOT EXISTS akasha_ai.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

CREATE TABLE IF NOT EXISTS akasha_ai.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  type TEXT DEFAULT 'referral',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.referral_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  reached_at TIMESTAMPTZ DEFAULT now()
);

-- Achievements
CREATE TABLE IF NOT EXISTS akasha_ai.achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  xp_reward INTEGER DEFAULT 0,
  points_reward INTEGER DEFAULT 0,
  condition_type TEXT,
  condition_value INTEGER,
  category TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS akasha_ai.user_achievements (
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES akasha_ai.achievements(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Purama Points
CREATE TABLE IF NOT EXISTS akasha_ai.purama_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER DEFAULT 0,
  lifetime_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  source TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Point Shop
CREATE TABLE IF NOT EXISTS akasha_ai.point_shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cost_points INTEGER NOT NULL,
  type TEXT NOT NULL,
  value TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.point_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  item_id UUID REFERENCES akasha_ai.point_shop_items(id),
  points_spent INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Gifts
CREATE TABLE IF NOT EXISTS akasha_ai.daily_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  gift_type TEXT NOT NULL,
  gift_value TEXT NOT NULL,
  streak_count INTEGER DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT now()
);

-- Withdrawals
CREATE TABLE IF NOT EXISTS akasha_ai.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  iban TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT now()
);

-- User Coupons
CREATE TABLE IF NOT EXISTS akasha_ai.user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_percent INTEGER NOT NULL,
  source TEXT,
  expires_at TIMESTAMPTZ,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS akasha_ai.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'eur',
  status TEXT DEFAULT 'paid',
  stripe_invoice_id TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contests
CREATE TABLE IF NOT EXISTS akasha_ai.contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  pool_amount NUMERIC(10,2) DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.contest_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID REFERENCES akasha_ai.contests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS akasha_ai.contest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID REFERENCES akasha_ai.contests(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  type TEXT NOT NULL,
  winners JSONB DEFAULT '[]',
  amounts JSONB DEFAULT '[]',
  total_pool NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lottery
CREATE TABLE IF NOT EXISTS akasha_ai.lottery_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date TIMESTAMPTZ NOT NULL,
  pool_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.lottery_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  draw_id UUID REFERENCES akasha_ai.lottery_draws(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.lottery_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id UUID REFERENCES akasha_ai.lottery_draws(id) ON DELETE CASCADE,
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES akasha_ai.lottery_tickets(id),
  rank INTEGER NOT NULL,
  amount_won NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Influencer
CREATE TABLE IF NOT EXISTS akasha_ai.influencer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  social_links JSONB DEFAULT '{}',
  approved BOOLEAN DEFAULT true,
  kit_downloaded BOOLEAN DEFAULT false,
  tier TEXT DEFAULT 'bronze',
  free_plan_granted TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akasha_ai.influencer_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  clicks INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cross-Promo (V7 §15 — tracking complet)
CREATE TABLE IF NOT EXISTS akasha_ai.cross_promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app TEXT NOT NULL,
  target_app TEXT NOT NULL,
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  coupon_code TEXT,
  used BOOLEAN DEFAULT false,
  clicked_at TIMESTAMPTZ DEFAULT now(),
  converted BOOLEAN DEFAULT false,
  coupon_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Social Shares
CREATE TABLE IF NOT EXISTS akasha_ai.social_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  share_code TEXT NOT NULL,
  platform_hint TEXT,
  shared_at TIMESTAMPTZ DEFAULT now(),
  points_given INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS akasha_ai.share_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES akasha_ai.social_shares(id) ON DELETE CASCADE,
  new_user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  converted_at TIMESTAMPTZ DEFAULT now(),
  bonus_points_given INTEGER DEFAULT 0
);

-- Support
CREATE TABLE IF NOT EXISTS akasha_ai.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FAQ
CREATE TABLE IF NOT EXISTS akasha_ai.faq_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  search_keywords TEXT[] DEFAULT '{}',
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contact
CREATE TABLE IF NOT EXISTS akasha_ai.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  responded BOOLEAN DEFAULT false
);

-- Email Sequences
CREATE TABLE IF NOT EXISTS akasha_ai.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened BOOLEAN DEFAULT false,
  clicked BOOLEAN DEFAULT false
);

-- Notification Preferences
CREATE TABLE IF NOT EXISTS akasha_ai.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE UNIQUE,
  types JSONB DEFAULT '{}',
  frequency TEXT DEFAULT 'normal',
  hour_start INTEGER DEFAULT 9,
  hour_end INTEGER DEFAULT 20,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pool Balances (reward/asso/partner)
CREATE TABLE IF NOT EXISTS akasha_ai.pool_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type TEXT UNIQUE NOT NULL,
  balance NUMERIC(10,2) DEFAULT 0,
  total_in NUMERIC(10,2) DEFAULT 0,
  total_out NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS akasha_ai.pool_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  direction TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pending Earnings (free users)
CREATE TABLE IF NOT EXISTS akasha_ai.pending_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  source TEXT NOT NULL,
  unlocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Feedback
CREATE TABLE IF NOT EXISTS akasha_ai.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akasha_ai.profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  category TEXT,
  points_given INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Health Checks (monitoring)
CREATE TABLE IF NOT EXISTS akasha_ai.health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  checked_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS for V3 tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE akasha_ai.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.referral_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.purama_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.point_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.point_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.daily_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.user_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.contest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.contest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.lottery_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.lottery_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.lottery_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.influencer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.influencer_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.cross_promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.share_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.faq_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.pool_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.pool_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.pending_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE akasha_ai.health_checks ENABLE ROW LEVEL SECURITY;

-- V3 RLS Policies
DO $$ BEGIN
  -- Referrals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_referral_codes' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_referral_codes ON akasha_ai.referral_codes FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_referrals' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_referrals ON akasha_ai.referrals FOR ALL USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_commissions' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_commissions ON akasha_ai.commissions FOR ALL USING (auth.uid() = referrer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_referral_milestones' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_referral_milestones ON akasha_ai.referral_milestones FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Achievements (public read)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_achievements' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_achievements ON akasha_ai.achievements FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_user_achievements' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_user_achievements ON akasha_ai.user_achievements FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Points
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_points' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_points ON akasha_ai.purama_points FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_point_txns' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_point_txns ON akasha_ai.point_transactions FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Shop items (public read)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_shop_items' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_shop_items ON akasha_ai.point_shop_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_purchases' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_purchases ON akasha_ai.point_purchases FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Daily gifts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_daily_gifts' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_daily_gifts ON akasha_ai.daily_gifts FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Withdrawals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_withdrawals' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_withdrawals ON akasha_ai.withdrawals FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Coupons
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_coupons' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_coupons ON akasha_ai.user_coupons FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Invoices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_invoices' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_invoices ON akasha_ai.invoices FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Contests (public read)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_contests' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_contests ON akasha_ai.contests FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_contest_entries' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_contest_entries ON akasha_ai.contest_entries FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_contest_results' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_contest_results ON akasha_ai.contest_results FOR SELECT USING (true);
  END IF;
  -- Lottery (public read draws)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_lottery_draws' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_lottery_draws ON akasha_ai.lottery_draws FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_lottery_tickets' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_lottery_tickets ON akasha_ai.lottery_tickets FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_lottery_wins' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_lottery_wins ON akasha_ai.lottery_winners FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Influencer
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_influencer_profile' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_influencer_profile ON akasha_ai.influencer_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_influencer_stats' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_influencer_stats ON akasha_ai.influencer_stats FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Cross promo
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_cross_promos' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_cross_promos ON akasha_ai.cross_promos FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Social shares
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_social_shares' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_social_shares ON akasha_ai.social_shares FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Support tickets
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_support_tickets' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_support_tickets ON akasha_ai.support_tickets FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- FAQ (public)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_read_faq' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_read_faq ON akasha_ai.faq_articles FOR SELECT USING (true);
  END IF;
  -- Contact (insert only)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_insert_contact' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY anyone_insert_contact ON akasha_ai.contact_messages FOR INSERT WITH CHECK (true);
  END IF;
  -- Email sequences
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_email_sequences' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_email_sequences ON akasha_ai.email_sequences FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Notification prefs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_notif_prefs' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_notif_prefs ON akasha_ai.notification_preferences FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Pending earnings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_pending_earnings' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_pending_earnings ON akasha_ai.pending_earnings FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- User feedback
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_feedback' AND schemaname = 'akasha_ai') THEN
    CREATE POLICY users_own_feedback ON akasha_ai.user_feedback FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- V3 Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON akasha_ai.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referrer ON akasha_ai.commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_point_txns_user ON akasha_ai.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_gifts_user ON akasha_ai.daily_gifts(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON akasha_ai.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_tickets_user ON akasha_ai.lottery_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_social_shares_user ON akasha_ai.social_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_influencer_slug ON akasha_ai.influencer_profiles(slug);

-- Init pool balances
INSERT INTO akasha_ai.pool_balances (pool_type, balance) VALUES
  ('reward', 0), ('asso', 0), ('partner', 0)
ON CONFLICT (pool_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Seeds
-- ═══════════════════════════════════════════════════════════════════════

-- Seed badges
INSERT INTO akasha_ai.badges (id, name, description, icon, xp_reward, condition_type, condition_value) VALUES
  ('first_step', 'Premier Pas', 'Premiere utilisation', '🌱', 10, 'count', 1),
  ('streak_7', 'Flamme', '7 jours consecutifs', '🔥', 50, 'streak', 7),
  ('streak_30', 'Diamant', '30 jours consecutifs', '💎', 200, 'streak', 30),
  ('artist', 'Artiste', '100 images generees', '🎨', 100, 'count', 100),
  ('director', 'Realisateur', '50 videos generees', '🎬', 150, 'count', 50),
  ('composer', 'Compositeur', '25 musiques generees', '🎵', 100, 'count', 25),
  ('creator', 'Createur', 'Premier agent cree', '🤖', 25, 'count', 1),
  ('seller', 'Vendeur', 'Premier agent vendu', '🏪', 50, 'marketplace', 1),
  ('top_10', 'Top 10', 'Dans le top 10 du classement', '⭐', 500, 'level', 1),
  ('akashique', 'Akashique', 'Niveau 100 atteint', '🌌', 1000, 'level', 100),
  ('connector', 'Connecteur', '10 personnes invitees', '👥', 200, 'count', 10),
  ('beta_tester', 'Beta Testeur', 'Badge exclusif early adopters', '🧪', 100, 'count', 1)
ON CONFLICT (id) DO NOTHING;

-- Seed achievements
INSERT INTO akasha_ai.achievements (id, name, description, icon, xp_reward, points_reward, condition_type, condition_value, category) VALUES
  ('first_chat', 'Premiere Conversation', 'Envoie ton premier message', '💬', 10, 100, 'chat_count', 1, 'general'),
  ('chat_100', 'Bavard', '100 messages envoyes', '🗣️', 50, 300, 'chat_count', 100, 'general'),
  ('image_first', 'Premier Chef-d oeuvre', 'Genere ta premiere image', '🖼️', 10, 100, 'image_count', 1, 'creation'),
  ('image_50', 'Artiste Numerique', '50 images generees', '🎨', 100, 500, 'image_count', 50, 'creation'),
  ('video_first', 'Cineaste', 'Genere ta premiere video', '🎬', 15, 150, 'video_count', 1, 'creation'),
  ('agent_create', 'Architecte IA', 'Cree ton premier agent', '🤖', 25, 200, 'agent_count', 1, 'builder'),
  ('agent_publish', 'Editeur', 'Publie un agent sur le marketplace', '📦', 50, 500, 'publish_count', 1, 'builder'),
  ('streak_3', 'Regulier', '3 jours consecutifs', '🔥', 20, 100, 'streak', 3, 'engagement'),
  ('streak_7', 'Flamme', '7 jours consecutifs', '🔥', 50, 300, 'streak', 7, 'engagement'),
  ('streak_30', 'Legende', '30 jours consecutifs', '💎', 200, 1000, 'streak', 30, 'engagement'),
  ('referral_first', 'Ambassadeur', 'Invite ton premier ami', '👥', 50, 500, 'referral_count', 1, 'social'),
  ('referral_10', 'Porte-Voix', '10 amis invites', '🌟', 200, 2000, 'referral_count', 10, 'social'),
  ('level_10', 'Apprenti', 'Atteins le niveau 10', '📈', 100, 500, 'level', 10, 'progression'),
  ('level_50', 'Expert', 'Atteins le niveau 50', '🏆', 500, 2500, 'level', 50, 'progression'),
  ('level_100', 'Akashique', 'Atteins le niveau 100', '🌌', 1000, 5000, 'level', 100, 'progression')
ON CONFLICT (id) DO NOTHING;

-- Seed FAQ
INSERT INTO akasha_ai.faq_articles (category, question, answer, search_keywords) VALUES
  ('general', 'Qu est-ce qu AKASHA AI ?', 'AKASHA AI est un agregateur multi-IA qui te permet d acceder a plusieurs modeles d intelligence artificielle depuis une seule interface. Chat, generation d images, videos, musique, code — tout est reuni.', ARRAY['akasha', 'ia', 'intelligence', 'artificielle', 'agregateur']),
  ('general', 'Comment creer un compte ?', 'Clique sur "Commencer gratuitement" sur la page d accueil, puis remplis le formulaire d inscription avec ton email ou connecte-toi avec Google.', ARRAY['compte', 'inscription', 'signup', 'google']),
  ('general', 'AKASHA est-il gratuit ?', 'Oui ! Le plan gratuit te donne acces a 10 questions par jour. Pour plus de fonctionnalites, decouvre nos plans payants a partir de 7 euros/mois.', ARRAY['gratuit', 'prix', 'free', 'plan']),
  ('chat', 'Comment changer de modele IA ?', 'Dans le chat, clique sur le selecteur de modele en haut. Tu peux choisir entre AKASHA Sonnet (equilibre), Opus (reflexion profonde) ou Haiku (ultra-rapide).', ARRAY['modele', 'model', 'sonnet', 'opus', 'haiku', 'changer']),
  ('chat', 'Mes conversations sont-elles privees ?', 'Absolument. Tes conversations sont chiffrees et stockees de maniere securisee. Personne d autre que toi n y a acces.', ARRAY['prive', 'securite', 'donnees', 'confidentialite']),
  ('creation', 'Comment generer une image ?', 'Va dans Studio Creatif depuis le menu, choisis "Image", decris ce que tu veux en detail et clique sur Generer. Plus ta description est precise, meilleur sera le resultat.', ARRAY['image', 'generer', 'creation', 'studio']),
  ('creation', 'Quels formats de creation sont disponibles ?', 'AKASHA supporte la generation d images, de videos, de musique et de code. Chaque type a ses propres modeles specialises.', ARRAY['format', 'type', 'image', 'video', 'musique', 'code']),
  ('agents', 'Qu est-ce qu un agent IA ?', 'Un agent est une IA personnalisee avec un role specifique. Par exemple, un agent "Expert Marketing" ou "Coach Fitness". Tu peux creer les tiens ou installer ceux du marketplace.', ARRAY['agent', 'personnalise', 'role', 'marketplace']),
  ('agents', 'Comment publier un agent sur le marketplace ?', 'Cree ton agent dans "Mes Agents", teste-le, puis clique sur "Publier". Ton agent sera disponible pour tous les utilisateurs et tu pourras meme le monetiser.', ARRAY['publier', 'marketplace', 'vendre', 'monetiser']),
  ('billing', 'Comment fonctionne la facturation ?', 'Les abonnements sont geres via Stripe. Tu peux payer par carte bancaire, PayPal ou Apple Pay. Les factures sont disponibles dans Parametres > Facturation.', ARRAY['facturation', 'paiement', 'stripe', 'facture', 'carte']),
  ('billing', 'Comment annuler mon abonnement ?', 'Va dans Parametres > Facturation > Gerer mon abonnement. Tu seras redirige vers le portail Stripe ou tu pourras annuler. Tu garderas l acces jusqu a la fin de la periode payee.', ARRAY['annuler', 'resiliation', 'abonnement']),
  ('referral', 'Comment fonctionne le parrainage ?', 'Partage ton lien de parrainage (disponible dans le dashboard). Quand quelqu un s inscrit avec ton lien, tu gagnes des points et des commissions sur ses abonnements. Paliers : Bronze (5), Argent (10), Or (25), Platine (50), Diamant (75), Legende (100).', ARRAY['parrainage', 'referral', 'invite', 'commission', 'lien']),
  ('wallet', 'Comment retirer mes gains ?', 'Va dans ton Wallet, clique sur "Retirer". Montant minimum : 5 euros. Renseigne ton IBAN et les fonds seront vires sous 48h.', ARRAY['retrait', 'wallet', 'iban', 'argent', 'gains']),
  ('points', 'A quoi servent les Purama Points ?', 'Les points te permettent d obtenir des reductions, des mois gratuits, des tickets de tirage ou de les convertir en euros. 1 point = 0.01 euros. Gagne-les en utilisant l app, en parrainant ou en completant des missions.', ARRAY['points', 'purama', 'reduction', 'conversion']),
  ('support', 'Comment contacter le support ?', 'Utilise le chatbot d aide integre (bouton en bas a droite) ou envoie un message via la page Contact. Notre IA repond instantanement, et un humain prend le relais si necessaire.', ARRAY['support', 'contact', 'aide', 'probleme'])
ON CONFLICT DO NOTHING;
