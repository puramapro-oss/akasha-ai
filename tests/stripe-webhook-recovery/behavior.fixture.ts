import { vi } from 'vitest'
import type Stripe from 'stripe'
import { createHash } from 'node:crypto'

export type JsonRecord = Record<string, unknown>
export type Row = {
  identity: JsonRecord
  event: JsonRecord
  state: 'processing' | 'completed' | 'reconciliation_required'
  attempt_token: string | null
  legacy: boolean
}
export type Barrier = { entered: Promise<void>; wait: Promise<void>; signal: () => void; release: () => void }

const fixture = vi.hoisted(() => {
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const key = (value: JsonRecord) => JSON.stringify([value.stripe_account_key, value.livemode, value.event_id])
  const identity = (value: JsonRecord) => ({
    stripe_account_key: value.stripe_account_key,
    livemode: value.livemode,
    event_id: value.event_id,
    fingerprint: value.fingerprint,
  })
  const state = {
    stripe: null as unknown as Stripe,
    claimError: null as null | string,
    loseAdmissionAcknowledgement: false,
    admissionPatch: null as null | ((receipt: JsonRecord) => unknown),
    completionMode: 'ok' as 'ok' | 'error-before' | 'error-after' | 'throw-after',
    completionPatch: null as null | ((receipt: JsonRecord) => unknown),
    reconciliationError: false,
    profileError: null as null | string,
    profileLookupError: false,
    loseCheckoutAcknowledgement: false,
    profileBarrier: null as Barrier | null,
    walletError: null as null | 'upsert' | 'lookup' | 'insert' | 'update',
    invoiceNumberError: false,
    paymentError: false,
    karmaMode: 'unexpected' as 'unexpected' | 'ok' | 'not-ok' | 'throw' | 'real-legacy' | 'real-success',
    legacyOrigins: new Set<string>(),
    claims: new Map<string, Row>(),
    primeReceipts: new Map<string, JsonRecord>(),
    claimAttempts: [] as JsonRecord[],
    completionAttempts: [] as JsonRecord[],
    reconciliationAttempts: [] as JsonRecord[],
    profileAttempts: [] as JsonRecord[],
    profileLookups: [] as JsonRecord[],
    invoiceNumberAttempts: [] as JsonRecord[],
    profileWrites: [] as JsonRecord[],
    walletAttempts: [] as JsonRecord[],
    walletTransactions: [] as JsonRecord[],
    walletUpdates: [] as JsonRecord[],
    paymentAttempts: [] as JsonRecord[],
    paymentWrites: [] as JsonRecord[],
    karmaAttempts: [] as unknown[],
    karmaRpcAttempts: [] as JsonRecord[],
    karmaSkipLogs: [] as JsonRecord[],
    responses: [] as Array<{ ingress: string; status: number; body: unknown }>,
    diagnostics: [] as unknown[],
    timeline: [] as string[],
    serviceClientCalls: 0,
    stripeClientCalls: 0,
    networkAttempts: 0,
  }
  const admissionReceipt = (row: Row, admitted: boolean) => ({
    admitted, state: row.state, ...row.identity,
    attempt_token: admitted ? row.attempt_token : null, legacy: row.legacy,
  })
  const db = {
    // This is an inert database PORT, not a substitute implementation of the handler.
    // Real SQL tests separately qualify atomicity, grants and legacy lookups.
    async rpc(name: string, args: JsonRecord = {}) {
      if (name === 'complete_checkout_prime_j1') {
        // Model one commit boundary, not durable intermediate profile writes.
        // SQL rollback/locking proof comes from prime-*.test.ts, not these arrays.
        const identity = JSON.stringify([args.p_stripe_account_key, args.p_livemode, args.p_checkout_session_id])
        const framed = [args.p_customer_id, args.p_subscription_id, args.p_plan, args.p_plan_tier]
          .map(value => value === null ? 'n;' : Buffer.byteLength(String(value), 'utf8') + ':' + value + ';').join('')
        const intentHash = createHash('sha256').update('akasha-checkout-profile-v1;' + framed, 'utf8').digest('hex')
        const previous = state.primeReceipts.get(identity)
        if (previous) {
          if (previous.user_id !== args.p_user_id || previous.amount !== args.p_amount
            || previous.currency !== args.p_currency || previous.promo_source !== args.p_promo_source
            || previous.profile_intent_sha256 !== intentHash) return { data: null, error: { code: '22023' } }
          return { data: { ...previous, status: 'already_credited' }, error: null }
        }
        const profileData: JsonRecord = { stripe_customer_id: args.p_customer_id,
          stripe_subscription_id: args.p_subscription_id, subscription_started_at: new Date().toISOString() }
        if (args.p_plan !== null) { profileData.plan = args.p_plan; profileData.plan_tier = args.p_plan_tier }
        const profileAttempt = { column: 'id', value: args.p_user_id, data: profileData }
        state.profileAttempts.push(profileAttempt)
        state.timeline.push('profile-attempt')
        const barrier = state.profileBarrier
        if (barrier) { barrier.signal(); await barrier.wait }
        if (state.profileError) return { data: null, error: { code: state.profileError } }
        for (const operation of ['upsert', 'lookup', 'insert', 'update']) {
          state.walletAttempts.push({ operation })
          if (state.walletError === operation) return { data: null, error: { code: '08006' } }
        }
        const receipt = {
          version: 1, status: 'credited', stripe_account_key: args.p_stripe_account_key,
          livemode: args.p_livemode, checkout_session_id: args.p_checkout_session_id,
          user_id: args.p_user_id, promo_source: args.p_promo_source,
          amount: args.p_amount, currency: args.p_currency,
          wallet_id: 'wallet-inert', transaction_id: 'transaction-inert',
          balance_after: args.p_amount, total_earned_after: args.p_amount,
          profile_intent_version: 1, profile_intent_sha256: intentHash,
        }
        state.profileWrites.push(profileAttempt)
        state.walletTransactions.push({ wallet_id: receipt.wallet_id, amount: args.p_amount, type: 'prime_j1' })
        state.walletUpdates.push({ column: 'id', value: receipt.wallet_id,
          data: { balance: receipt.balance_after, total_earned: receipt.total_earned_after } })
        state.timeline.push('profile-confirmed', 'transaction-confirmed', 'wallet-confirmed')
        state.primeReceipts.set(identity, receipt)
        if (state.loseCheckoutAcknowledgement) {
          state.loseCheckoutAcknowledgement = false
          throw new Error('Synthetic response lost after profile+prime SQL commit')
        }
        return { data: receipt, error: null }
      }
      if (name === 'admit_stripe_webhook_event') {
        state.claimAttempts.push(copy(args))
        state.timeline.push('admit')
        if (state.claimError) return { data: null, error: { code: state.claimError } }
        const event = args.p_event as JsonRecord
        const token = args.p_attempt_token as string
        const journalKey = key(event)
        let row = state.claims.get(journalKey)
        let admitted = false
        if (row) {
          if (row.identity.fingerprint !== event.fingerprint) {
            return { data: null, error: { code: '22023', message: 'Synthetic identity conflict' } }
          }
        } else {
          const legacy = state.legacyOrigins.size > 0
          row = { identity: identity(event), event: copy(event), state: legacy ? 'reconciliation_required' : 'processing',
            attempt_token: legacy ? null : token, legacy }
          state.claims.set(journalKey, row)
          admitted = !legacy
        }
        if (state.loseAdmissionAcknowledgement) {
          state.loseAdmissionAcknowledgement = false
          return { data: null, error: { code: '08006', message: 'Synthetic admission acknowledgement lost' } }
        }
        const receipt = admissionReceipt(row, admitted)
        return { data: state.admissionPatch ? state.admissionPatch(receipt) : receipt, error: null }
      }
      if (name === 'complete_stripe_webhook_event') {
        state.completionAttempts.push(copy(args))
        state.timeline.push('complete')
        const supplied = args.p_identity as JsonRecord
        const row = state.claims.get(key(supplied))
        if (!row || row.attempt_token !== args.p_attempt_token ||
          row.identity.fingerprint !== supplied.fingerprint || row.state !== 'processing') {
          return { data: null, error: { code: '42501', message: 'Synthetic ownership rejection' } }
        }
        if (state.completionMode === 'error-before') return { data: null, error: { code: '08006' } }
        row.state = 'completed'
        if (state.completionMode === 'error-after') return { data: null, error: { code: '08006' } }
        if (state.completionMode === 'throw-after') throw new Error('Synthetic completion acknowledgement lost')
        const receipt = { completed: true, ...row.identity, attempt_token: row.attempt_token }
        return { data: state.completionPatch ? state.completionPatch(receipt) : receipt, error: null }
      }
      if (name === 'reconcile_stripe_webhook_event') {
        state.reconciliationAttempts.push(copy(args))
        state.timeline.push('reconcile')
        if (state.reconciliationError) return { data: null, error: { code: '08006' } }
        const supplied = args.p_identity as JsonRecord
        const row = state.claims.get(key(supplied))
        if (!row || row.attempt_token !== args.p_attempt_token || row.identity.fingerprint !== supplied.fingerprint) {
          return { data: null, error: { code: '42501' } }
        }
        if (row.state !== 'completed') row.state = 'reconciliation_required'
        return { data: { recorded: true, state: row.state, ...row.identity, attempt_token: row.attempt_token }, error: null }
      }
      if (name === 'karma_split_apply_akasha') {
        state.karmaRpcAttempts.push(copy(args))
        const legacy = state.karmaMode === 'real-legacy'
        return { data: { log_id: 'synthetic-existing-financial-log', already_processed: legacy,
          pool_tx_ids: legacy ? [] : ['synthetic-reward', 'synthetic-adya', 'synthetic-asso', 'synthetic-sasu'] }, error: null }
      }
      if (name === 'next_invoice_number') {
        state.invoiceNumberAttempts.push(copy(args))
        return state.invoiceNumberError
          ? { data: null, error: { code: '08006' } }
          : { data: 'SYNTHETIC-INVOICE-1', error: null }
      }
      throw new Error('Unexpected database RPC boundary: ' + name)
    },
    from(table: string) {
      if (table === 'profiles') return {
        update(data: JsonRecord) {
          return { eq(column: string, value: string) { return { select() { return { async single() {
            state.profileAttempts.push({ column, value, data: copy(data) })
            state.timeline.push('profile-attempt')
            const barrier = state.profileBarrier
            if (barrier) { barrier.signal(); await barrier.wait }
            if (state.profileError) return { data: null, error: { code: state.profileError } }
            state.profileWrites.push({ column, value, data: copy(data) })
            state.timeline.push('profile-confirmed')
            return { data: { id: column === 'id' ? value : '00000000-0000-4000-8000-000000000001',
              stripe_customer_id: column === 'stripe_customer_id' ? value : data.stripe_customer_id }, error: null }
          } } } } } }
        },
        select() { return { eq(column: string, value: string) { return { async single() {
          state.profileLookups.push({ column, value })
          return state.profileLookupError
            ? { data: null, error: { code: '08006' } }
            : { data: { id: '00000000-0000-4000-8000-000000000001' }, error: null }
        } } } } },
      }
      if (table === 'wallets') return {
        upsert() {
          state.walletAttempts.push({ operation: 'upsert' })
          return { select() { return { async single() {
            return state.walletError === 'upsert'
              ? { data: null, error: { code: '08006' } }
              : { data: { id: 'wallet-inert', balance: 0, total_earned: 0 }, error: null }
          } } } }
        },
        update(data: JsonRecord) { return { eq(column: string, value: string) { return { select() { return { async single() {
          state.walletAttempts.push({ operation: 'update', column, value, data: copy(data) })
          if (state.walletError === 'update') return { data: null, error: { code: '08006' } }
          state.walletUpdates.push({ column, value, data: copy(data) })
          state.timeline.push('wallet-confirmed')
          return { data: { id: value, ...data }, error: null }
        } } } } } } },
      }
      if (table === 'wallet_transactions') {
        const query = {
          eq() { return query }, ilike() { return query }, limit() { return query },
          async maybeSingle() {
            state.walletAttempts.push({ operation: 'lookup' })
            return state.walletError === 'lookup'
              ? { data: null, error: { code: '08006' } }
              : { data: state.walletTransactions.length ? { id: 'transaction-inert' } : null, error: null }
          },
        }
        return {
          select() { return query },
          insert(row: JsonRecord) { return { select() { return { async single() {
            state.walletAttempts.push({ operation: 'insert', row: copy(row) })
            if (state.walletError === 'insert') return { data: null, error: { code: '08006' } }
            state.walletTransactions.push(copy(row))
            state.timeline.push('transaction-confirmed')
            return { data: { id: 'transaction-inert' }, error: null }
          } } } } },
        }
      }
      if (table === 'karma_split_log') return { insert(row: JsonRecord) { return { select() { return { async single() {
        state.karmaSkipLogs.push(copy(row))
        return { data: { id: 'synthetic-zero-invoice-log' }, error: null }
      } } } } } }
      if (table === 'payments') return { insert(row: JsonRecord) { return { select() { return { async single() {
        state.paymentAttempts.push(copy(row))
        if (state.paymentError) return { data: null, error: { code: '08006' } }
        state.paymentWrites.push(copy(row))
        return { data: { id: 'payment-inert' }, error: null }
      } } } } } }
      throw new Error('Unexpected database boundary: ' + table)
    },
  }
  return { state, db }
})

export { fixture }
