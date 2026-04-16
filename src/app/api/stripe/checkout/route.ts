import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'
import { STRIPE_PRICE_IDS } from '@/lib/stripe-prices'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import type { Plan, PlanTier } from '@/types'

const CheckoutSchema = z.object({
  plan: z.enum(['automate', 'create', 'build', 'complete']),
  tier: z.enum(['essential', 'pro', 'max']),
})

type PuramaPromo = {
  coupon: string
  source: string
  set_at: number
}

function parsePromoCookie(raw: string | undefined): PuramaPromo | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'coupon' in parsed &&
      typeof (parsed as { coupon: unknown }).coupon === 'string'
    ) {
      return parsed as PuramaPromo
    }
  } catch {
    // cookie corrompu ou non JSON
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as unknown
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { plan, tier } = parsed.data

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, display_name')
      .eq('id', user.id)
      .single()

    const serviceClient = createServiceClient()
    let customerId = profile?.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? '',
        name: profile?.display_name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id

      await serviceClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const priceId = STRIPE_PRICE_IDS[plan as Exclude<Plan, 'free'>][tier as PlanTier]
    const origin = req.headers.get('origin') ?? 'https://akasha.purama.dev'

    // V7 §15 — lire cookie purama_promo pour auto-apply le coupon cross-app
    const cookieStore = await cookies()
    const promo = parsePromoCookie(cookieStore.get('purama_promo')?.value)

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan,
        tier,
        promo_coupon: promo?.coupon ?? '',
        promo_source: promo?.source ?? '',
      },
    }

    if (promo?.coupon) {
      // Stripe refuse allow_promotion_codes + discounts simultanément
      sessionParams.discounts = [{ coupon: promo.coupon }]
    } else {
      sessionParams.allow_promotion_codes = true
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url, promo_applied: promo?.coupon ?? null })
  } catch (err) {
    console.error('[stripe/checkout]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
