import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { configuredStripeWebhookMode } from '@/lib/stripe/webhook-mode'
import { handleVerifiedStripeWebhook } from '@/lib/stripe/webhook-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_WEBHOOK_SECRET
  if (!expected || expected.trim().length === 0 || req.headers.get('x-internal-secret') !== expected) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const body = await req.text()
  const signature = req.headers.get('x-stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-stripe-signature' }, { status: 400 })
  }
  if (configuredStripeWebhookMode() === null) {
    return NextResponse.json({ error: 'webhook_configuration_unavailable' }, { status: 503 })
  }
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  return handleVerifiedStripeWebhook(event)
}
