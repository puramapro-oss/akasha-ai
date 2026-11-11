import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase'
import { createPublicServiceClient } from '@/lib/supabase-public'
import { dispatchKarmaSplit } from '@/lib/karma/dispatch'
import {
  admitStripeWebhookEvent, completeStripeWebhookEvent, reconcileStripeWebhookEvent,
  stripeWebhookEnvelope, stripeWebhookIdentity,
} from '@/lib/webhook-idempotency'
import { syncConnectAccount } from './connect'
import { PRICE_TO_PLAN } from './webhook-constants'
import { configuredStripeWebhookMode, stripeWebhookModeMatches } from './webhook-mode'
import {
  creditPrimeJ1, trackCrossPromoConversion, updateProfileByCustomer, updateProfileById,
} from './webhook-helpers'

function reference(value: unknown): string {
  const id = typeof value === 'string' ? value
    : value && typeof value === 'object' ? (value as { id?: unknown }).id : null
  if (typeof id !== 'string' || id.length === 0 || id.length > 255) {
    throw new Error('Required Stripe reference is missing')
  }
  return id
}

function numericResult(value: unknown): boolean {
  return (typeof value === 'number' || typeof value === 'string')
    && String(value).trim() !== '' && Number.isFinite(Number(value))
}

// These legacy effects are not one transaction. A distinct Event for the same
// economic object is also a separate concern. Do not infer ordering from created,
// release an uncertain attempt, or automatically replay its partial effects.
async function applyVerifiedEvent(event: Stripe.Event) {
  const db = createServiceClient()
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = reference(session.customer)
      const subscriptionId = reference(session.subscription)
      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan
      const tier = session.metadata?.tier
      const profileUpdate: Record<string, unknown> = {
        stripe_customer_id: customerId, stripe_subscription_id: subscriptionId,
        subscription_started_at: new Date().toISOString(),
      }
      if (plan && tier) { profileUpdate.plan = plan; profileUpdate.plan_tier = tier }
      if (userId) await updateProfileById(reference(userId), profileUpdate)
      else await updateProfileByCustomer(customerId, profileUpdate)
      if (userId) await creditPrimeJ1(userId, reference(session.id), session.metadata?.promo_source || null, {
        stripe_account_key: event.account ?? 'platform', livemode: event.livemode,
      })
      if (userId && session.metadata?.promo_coupon && session.metadata.promo_source) {
        await trackCrossPromoConversion(userId, session.metadata.promo_coupon, session.metadata.promo_source)
      }
      return
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const priceId = subscription.items.data[0]?.price?.id
      if (!priceId || !Object.hasOwn(PRICE_TO_PLAN, priceId)) {
        throw new Error('Subscription price requires reconciliation')
      }
      const { plan, tier } = PRICE_TO_PLAN[priceId]
      await updateProfileByCustomer(reference(subscription.customer), {
        stripe_subscription_id: reference(subscription.id), plan, plan_tier: tier,
      })
      return
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await updateProfileByCustomer(reference(subscription.customer), {
        stripe_subscription_id: null, plan: 'free', plan_tier: 'essential',
      })
      return
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      if (!Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid < 0
          || !Number.isSafeInteger(invoice.created) || invoice.created < 0
          || !/^[a-z]{3}$/.test(invoice.currency)) {
        throw new Error('Invoice fields require reconciliation')
      }
      const paidAt = new Date(invoice.created * 1000).toISOString()
      const profile = await db.from('profiles').select('id')
        .eq('stripe_customer_id', reference(invoice.customer)).single()
      if (profile.error || !profile.data?.id) throw new Error('Invoice profile lookup failed')
      const number = await db.rpc('next_invoice_number')
      if (number.error || (typeof number.data !== 'string' && !Number.isSafeInteger(number.data))
          || String(number.data).length === 0) {
        throw new Error('Invoice number was not confirmed')
      }
      const payment = await db.from('payments').insert({
        user_id: reference(profile.data.id), stripe_invoice_id: reference(invoice.id),
        invoice_number: number.data, amount: invoice.amount_paid / 100,
        currency: invoice.currency.toUpperCase(), status: 'paid', paid_at: paidAt,
      }).select('id').single()
      if (payment.error || !payment.data?.id) throw new Error('Invoice payment was not confirmed')
      return
    }
    case 'invoice.paid': {
      const result = await dispatchKarmaSplit(event.data.object as Stripe.Invoice)
      if (!result.ok || (result.status !== 'ok' && result.status !== 'skipped') || !result.logId) {
        throw new Error('Karma result was not confirmed')
      }
      return
    }
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const userId = reference(account.metadata?.user_id)
      const result = await syncConnectAccount(createPublicServiceClient(), userId, account)
      if (!result || result.user_id !== userId || result.stripe_account_id !== reference(account.id)) {
        throw new Error('Connect synchronization was not confirmed')
      }
      return
    }
    case 'transfer.reversed':
    case 'payout.failed': {
      const value = event.data.object as Stripe.Transfer | Stripe.Payout
      const publicDb = createPublicServiceClient()
      const result = await publicDb.from('connect_withdrawals')
        .select('id, user_id, amount_eur, status')
        .eq('stripe_transfer_id', reference(value.id)).maybeSingle()
      const withdrawal = result.data
      if (result.error || !withdrawal || !numericResult(withdrawal.amount_eur)
          || Number(withdrawal.amount_eur) <= 0
          || typeof withdrawal.status !== 'string'
          || ['reversed', 'failed'].includes(withdrawal.status)) {
        throw new Error('Withdrawal outcome requires reconciliation')
      }
      const status = event.type === 'transfer.reversed' ? 'reversed' : 'failed'
      const update = await publicDb.from('connect_withdrawals').update({
        status, completed_at: new Date().toISOString(),
        error: event.type === 'payout.failed'
          ? (value as Stripe.Payout).failure_message ?? 'payout_failed' : 'transfer_reversed',
      }).eq('id', reference(withdrawal.id)).eq('status', withdrawal.status)
        .select('id, status').single()
      if (update.error || update.data?.id !== withdrawal.id || update.data.status !== status) {
        throw new Error('Withdrawal status change was not confirmed')
      }
      const credit = await publicDb.rpc('credit_wallet_on_withdrawal_failure_akasha', {
        p_user_id: reference(withdrawal.user_id), p_amount: withdrawal.amount_eur,
      })
      if (credit.error || !numericResult(credit.data)) {
        throw new Error('Withdrawal credit was not confirmed')
      }
      return
    }
    default:
      return
  }
}

/** Both ingress routes authenticate the original body before calling this. */
export async function handleVerifiedStripeWebhook(event: Stripe.Event) {
  const mode = configuredStripeWebhookMode()
  if (mode === null) {
    return NextResponse.json({ error: 'webhook_configuration_unavailable' }, { status: 503 })
  }
  let db: ReturnType<typeof createServiceClient>
  let identity: ReturnType<typeof stripeWebhookIdentity>
  const attemptToken = randomUUID()
  try {
    const envelope = stripeWebhookEnvelope(event)
    if (!stripeWebhookModeMatches(event, mode)) {
      return NextResponse.json({ error: 'webhook_mode_mismatch' }, { status: 503 })
    }
    identity = stripeWebhookIdentity(envelope)
    db = createServiceClient()
    const admission = await admitStripeWebhookEvent(db, envelope, attemptToken)
    if (!admission.admitted) {
      return admission.state === 'completed'
        ? NextResponse.json({ received: true, duplicate: true })
        : NextResponse.json({ error: 'webhook_reconciliation_required' }, { status: 503 })
    }
  } catch {
    return NextResponse.json({ error: 'webhook_admission_unavailable' }, { status: 503 })
  }

  let reason: 'effect_failed' | 'completion_unconfirmed' = 'effect_failed'
  try {
    await applyVerifiedEvent(event)
    reason = 'completion_unconfirmed'
    await completeStripeWebhookEvent(db, identity, attemptToken)
    return NextResponse.json({ received: true })
  } catch {
    try {
      await reconcileStripeWebhookEvent(db, identity, attemptToken, reason)
    } catch {
      // Admission was already durable. If this confirmation is lost too, the
      // original processing row remains a barrier, never a takeover invitation.
    }
    return NextResponse.json({ error: 'webhook_reconciliation_required' }, { status: 503 })
  }
}
