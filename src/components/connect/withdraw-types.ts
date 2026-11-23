// =============================================================================
// AKASHA AI — Withdraw Types
// Types pour le retrait Stripe Connect
// =============================================================================

export interface WithdrawButtonProps {
  balanceEur: number;
  onSuccess?: (newBalanceEur: number) => void;
  disabled?: boolean;
  label?: string;
}

export interface WithdrawResponse {
  ok: boolean;
  transfer_id?: string;
  amount_eur?: number;
  new_balance_eur?: number;
  status?: string;
  error?: string;
  code?: string;
  request_id?: string;
  request_key?: string;
  operation_state?: string;
  replayed?: boolean;
  balance_restored?: boolean;
  cancellation_confirmed?: boolean;
  cancellation_id?: string;
  owner_id?: string;
  supersedes_request_key?: string;
  active_request?: { owner_id: string; request_key: string; amount_eur: number; requested_amount_eur: number | null };
}

export interface WithdrawModalProps {
  balanceEur: number;
  isOpen: boolean;
  onPendingChange?: (pending: boolean) => void;
  onClose: () => void;
  onSuccess: (response: WithdrawResponse) => void;
}
