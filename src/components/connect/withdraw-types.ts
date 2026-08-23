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
}

export interface WithdrawModalProps {
  balanceEur: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (response: WithdrawResponse) => void;
}
