import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase'
import { createPublicServiceClient } from '@/lib/supabase-public'
import { syncConnectAccount } from '@/lib/stripe/connect'
import { dispatchKarmaSplit } from '@/lib/karma/dispatch'
import { PRICE_TO_PLAN } from '@/lib/stripe/webhook-constants'
import {
  updateProfileByCustomer,
  updateProfileById,
  creditPrimeJ1,
  trackCrossPromoConversion,
} from '@/lib/stripe/webhook-helpers'
import type { Plan, PlanTier } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        const userId = session.metadata?.user_id
        const plan = session.metadata?.plan as Exclude<Plan, 'free'> | undefined
        const tier = session.metadata?.tier as PlanTier | undefined
        const promoCoupon = session.metadata?.promo_coupon || null
        const promoSource = session.metadata?.promo_source || null

        // 1) Active abo + flag subscription_started_at (V7 §20 — requis pour retrait 30j)
        const profileUpdate: Record<string, unknown> = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_started_at: new Date().toISOString(),
        }
        if (plan && tier) {
          profileUpdate.plan = plan
          profileUpdate.plan_tier = tier
        }

        if (userId) {
          await updateProfileById(userId, profileUpdate)
        } else if (customerId) {
          await updateProfileByCustomer(customerId, profileUpdate)
        }

        // 2) Crédit prime J+1 (25 €) — V7 §20
        if (userId) {
          try {
            await creditPrimeJ1(userId, session.id, promoSource)
          } catch (err) {
            console.error('[webhook] prime J+1 credit failed', err)
          }
        }

        // 3) Tracking cross-promo conversion — V7 §15
        if (userId && promoCoupon && promoSource) {
          try {
            await trackCrossPromoConversion(userId, promoCoupon, promoSource)
          } catch (err) {
            console.error('[webhook] cross_promo tracking failed', err)
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const priceId = subscription.items.data[0]?.price?.id

        if (priceId && PRICE_TO_PLAN[priceId]) {
          const { plan, tier } = PRICE_TO_PLAN[priceId]
          await updateProfileByCustomer(customerId, {
            stripe_subscription_id: subscription.id,
            plan,
            plan_tier: tier,
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        await updateProfileByCustomer(customerId, {
          stripe_subscription_id: null,
          plan: 'free',
          plan_tier: 'essential',
        })
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: profile } = await db
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (profile?.id) {
          const { data: invoiceNumber } = await db.rpc('next_invoice_number')

          await db.from('payments').insert({
            user_id: profile.id,
            stripe_invoice_id: invoice.id,
            invoice_number: invoiceNumber,
            amount: (invoice.amount_paid ?? 0) / 100,
            currency: invoice.currency?.toUpperCase() ?? 'EUR',
            status: 'paid',
            paid_at: new Date(invoice.created * 1000).toISOString(),
          })
        }
        break
      }

      // V4.1 Axe 2 — Karma Split 50/10/10/30 sur chaque invoice payé.
      // Fire-and-forget : ne throw JAMAIS, webhook garde 200 pour Stripe.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        try {
          await dispatchKarmaSplit(invoice)
        } catch {
          // dispatchKarmaSplit ne throw JAMAIS mais double-ceinture ici.
        }
        break
      }

      // V4.1 Axe 1 — Stripe Connect safety-net sync quand l'user complète KYC.
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const userId = account.metadata?.user_id
        if (userId) {
          try {
            const publicService = createPublicServiceClient()
            await syncConnectAccount(publicService, userId, account)
          } catch {
            // Sync best-effort
          }
        }
        break
      }

      // V4.1 Axe 3 — Reversal retrait Connect : créditer le wallet user.
      case 'transfer.reversed':
      case 'payout.failed': {
        const obj = event.data.object as Stripe.Transfer | Stripe.Payout
        const transferId = obj.id
        const publicService = createPublicServiceClient()

        const { data: withdrawal } = await publicService
          .from('connect_withdrawals')
          .select('id, user_id, amount_eur, status')
          .eq('stripe_transfer_id', transferId)
          .maybeSingle()

        if (withdrawal && withdrawal.status !== 'reversed' && withdrawal.status !== 'failed') {
          await publicService
            .from('connect_withdrawals')
            .update({
              status: event.type === 'transfer.reversed' ? 'reversed' : 'failed',
              completed_at: new Date().toISOString(),
              error: event.type === 'payout.failed'
                ? ((obj as Stripe.Payout).failure_message ?? 'payout_failed')
                : 'transfer_reversed',
            })
            .eq('id', withdrawal.id)

          try {
            await publicService.rpc('credit_wallet_on_withdrawal_failure_akasha', {
              p_user_id: withdrawal.user_id,
              p_amount: withdrawal.amount_eur,
            })
          } catch {
            // Reversal best-effort — super-admin alert déjà dans audit_log
          }
        }
        break
      }
    }
  } catch (err) {
    console.error('[stripe/webhook] Event handling error', err)
    // Return 200 to prevent Stripe from retrying non-recoverable errors
  }

  return NextResponse.json({ received: true })
}
