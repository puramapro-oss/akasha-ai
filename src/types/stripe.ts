// =============================================================================
// AKASHA AI — Stripe Connect V4.1 Types
// =============================================================================

// --- Connect (Express + Embedded Components) V4.1 ---

export type ConnectPayoutStatus =
  | 'pending'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'canceled';

export interface ConnectPayoutEvent {
  id: string;
  user_id: string;
  amount_eur: number;
  currency: string;
  status: ConnectPayoutStatus;
  arrival_date: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
}

export interface ConnectAccountSessionResponse {
  client_secret: string;
  expires_at: number;
  stripe_account_id: string;
}

export interface ConnectOnboardResponse {
  stripe_account_id: string;
  onboarding_completed: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
}

export type ConnectOnboardingStage =
  | 'not_started'
  | 'in_progress'
  | 'requirements_due'
  | 'verified';

export interface ConnectAccount {
  user_id: string;
  stripe_account_id: string;
  country: string;
  default_currency: string;
  onboarding_completed: boolean;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  kyc_verified_at: string | null;
  disabled_reason: string | null;
  capabilities: Record<string, unknown>;
  requirements: Record<string, unknown>;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectAccountSummary {
  has_account: boolean;
  stripe_account_id: string | null;
  onboarding_stage: ConnectOnboardingStage;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  disabled_reason: string | null;
  kyc_verified_at: string | null;
  country: string;
  default_currency: string;
  currently_due: string[];
  past_due: string[];
}

export interface ConnectWithdrawal {
  id: string;
  user_id: string;
  stripe_account_id: string;
  stripe_transfer_id: string | null;
  amount_eur: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'reversed';
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}
