import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const STRIPE_PLANS = {
  automate: {
    essential: { monthly: 700, annual: 469 },
    pro: { monthly: 1100, annual: 737 },
    max: { monthly: 1600, annual: 1072 },
  },
  create: {
    essential: { monthly: 700, annual: 469 },
    pro: { monthly: 1100, annual: 737 },
    max: { monthly: 1600, annual: 1072 },
  },
  build: {
    essential: { monthly: 700, annual: 469 },
    pro: { monthly: 1100, annual: 737 },
    max: { monthly: 1600, annual: 1072 },
  },
  complete: {
    essential: { monthly: 2200, annual: 1474 },
    pro: { monthly: 3300, annual: 2211 },
    max: { monthly: 4400, annual: 2948 },
  },
} as const

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  idempotencyKey: string
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card', 'paypal', 'link'],
    allow_promotion_codes: true,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      app_slug: 'akasha-ai',
    },
    subscription_data: {
      metadata: {
        app_slug: 'akasha-ai',
      },
    },
  }, { idempotencyKey })
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}
