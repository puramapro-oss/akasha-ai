-- Personal export of the new private journals. Direct table access stays denied.
-- Requires the email and withdrawal migrations earlier in this delivery.
BEGIN;

CREATE FUNCTION akasha_ai.export_own_delivery_receipts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE actor uuid := auth.uid(); emails jsonb; withdrawals jsonb; cancellations jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'email_type', d.email_type, 'state', d.state, 'provider_email_id', d.provider_email_id,
    'reason', d.reason, 'created_at', d.created_at, 'updated_at', d.updated_at, 'accepted_at', d.accepted_at
  ) ORDER BY d.created_at,d.email_type), '[]'::jsonb) INTO emails
  FROM akasha_ai.email_sequence_deliveries d WHERE d.user_id = actor;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'amount_eur', w.amount_eur, 'requested_amount_eur', w.requested_amount_eur,
    'destination', w.stripe_account_id, 'mode', w.mode, 'state', w.state,
    'transfer_id', w.transfer_id, 'balance_after_debit', w.balance_after_debit,
    'balance_after_restore', w.balance_after_restore, 'failure_code', w.failure_code,
    'created_at', w.created_at, 'updated_at', w.updated_at
  ) ORDER BY w.created_at,w.id), '[]'::jsonb) INTO withdrawals
  FROM akasha_ai.withdrawal_requests w WHERE w.user_id = actor;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'state', 'cancelled', 'created_at', c.created_at
  ) ORDER BY c.created_at,c.id), '[]'::jsonb) INTO cancellations
  FROM akasha_ai.withdrawal_cancellations c WHERE c.user_id = actor;
  -- No attempt token, payload digest or internal fraud analysis is exposed.
  RETURN jsonb_build_object('version',1,'user_id',actor,'emails',emails,
    'withdrawals',withdrawals,'withdrawal_cancellations',cancellations);
END;
$$;

REVOKE ALL ON FUNCTION akasha_ai.export_own_delivery_receipts() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION akasha_ai.export_own_delivery_receipts() TO authenticated;
COMMENT ON FUNCTION akasha_ai.export_own_delivery_receipts() IS
  'Read-only self export. The caller cannot choose a user; private dispatch tokens are excluded.';
COMMIT;
