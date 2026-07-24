import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase'
import { createPublicServiceClient } from '@/lib/supabase-public'
import { syncConnectAccount } from '@/lib/stripe/connect'
import { dispatchKarmaSplit } from '@/lib/karma/dispatch'
import type { Plan, PlanTier } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Map Stripe price IDs back to plan/tier
const PRICE_TO_PLAN: Record<string, { plan: Exclude<Plan, 'free'>; tier: PlanTier }> = {
  'price_1TJ1Qd4Y1unNvKtXg0D4EwNl': { plan: 'automate', tier: 'essential' },
  'price_1TJ1Qd4Y1unNvKtXxPBnMHH6': { plan: 'automate', tier: 'pro' },
  'price_1TJ1Qe4Y1unNvKtXbW6i1dbb': { plan: 'automate', tier: 'max' },
  'price_1TJ1Qf4Y1unNvKtXJ4AermBW': { plan: 'create', tier: 'essential' },
  'price_1TJ1Qg4Y1unNvKtXGDtTEGVI': { plan: 'create', tier: 'pro' },
  'price_1TJ1Qh4Y1unNvKtX9nRkx5iU': { plan: 'create', tier: 'max' },
  'price_1TJ1Qi4Y1unNvKtX5A9jRzzz': { plan: 'build', tier: 'essential' },
  'price_1TJ1Qj4Y1unNvKtXFXeoz1PH': { plan: 'build', tier: 'pro' },
  'price_1TJ1Qk4Y1unNvKtX4cq6L73s': { plan: 'build', tier: 'max' },
  'price_1TJ1Ql4Y1unNvKtXe0NQ6Mws': { plan: 'complete', tier: 'essential' },
  'price_1TJ1Qm4Y1unNvKtXVAlGNlmC': { plan: 'complete', tier: 'pro' },
  'price_1TJ1Qn4Y1unNvKtXXu1OPZNx': { plan: 'complete', tier: 'max' },
}

const PRIME_J1_AMOUNT = 25.0

async function updateProfileByCustomer(customerId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  await db.from('profiles').update(data).eq('stripe_customer_id', customerId)
}

async function updateProfileById(userId: string, data: Record<string, unknown>) {
  const db = createServiceClient()
  await db.from('profiles').update(data).eq('id', userId)
}

/**
 * V7 SUPREME §20 — Crédite la prime J+1 (25 €) sur le wallet Purama.
 * Idempotent : vérifie qu'aucune prime_j1 n'a déjà été versée à cet user.
 */
async function creditPrimeJ1(userId: string, sessionId: string, promoSource: string | null) {
  const db = createServiceClient()

  // 1) Assurer l'existence du wallet (upsert)
  const { data: wallet } = await db
    .from('wallets')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('id, balance, total_earned')
    .single()

  if (!wallet) {
    console.error('[webhook] wallet upsert failed for', userId)
    return
  }

  // 2) Idempotence — vérifier qu'on n'a pas déjà versé prime_j1 pour cette session
  const { data: existing } = await db
    .from('wallet_transactions')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('type', 'prime_j1')
    .ilike('description', `%${sessionId}%`)
    .limit(1)
    .maybeSingle()

  if (existing) return

  // 3) Insert la transaction et mettre à jour le solde
  const description = promoSource
    ? `Prime J+1 Purama — cross-promo ${promoSource} (session ${sessionId})`
    : `Prime J+1 Purama (session ${sessionId})`

  await db.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    amount: PRIME_J1_AMOUNT,
    type: 'prime_j1',
    description,
  })

  await db
    .from('wallets')
    .update({
      balance: Number(wallet.balance ?? 0) + PRIME_J1_AMOUNT,
      total_earned: Number(wallet.total_earned ?? 0) + PRIME_J1_AMOUNT,
    })
    .eq('id', wallet.id)
}

/**
 * V7 SUPREME §15 — Marque la conversion cross-promo.
 */
async function trackCrossPromoConversion(userId: string, coupon: string, source: string) {
  const db = createServiceClient()
  await db
    .from('cross_promos')
    .update({ converted: true, user_id: userId, coupon_used: coupon })
    .eq('source_app', source)
    .eq('target_app', 'akasha_ai')
    .is('user_id', null)
    .eq('coupon_code', coupon)
}

export async function POST(req: NextRequest) {
  // 1) Vérifie que l'appel vient de karma (dispatcher central)
  const internalSecret = req.headers.get('x-internal-secret')
  if (internalSecret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.text()
  const signature = req.headers.get('x-stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-stripe-signature' }, { status: 400 })
  }

  let event: Stripe.Event

  // 2) Défense en profondeur — re-vérifie quand même la signature Stripe originale
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[stripe-fulfillment] Signature verification failed', err)
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
          const invoiceNumber = `FA-${new Date().getFullYear()}-${String(invoice.number ?? Date.now()).slice(-6).padStart(6, '0')}`

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
