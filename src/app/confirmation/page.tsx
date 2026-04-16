import { redirect } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import ConfirmationClient from './ConfirmationClient'

type SessionSummary = {
  amountTotal: number // cents
  currency: string
  planLabel: string
  couponApplied: string | null
  couponPercent: number | null
}

/**
 * /confirmation?session_id=cs_... — page de confirmation post-Stripe Checkout.
 *
 * - Vérifie que la session Stripe est `paid`.
 * - Affiche les confettis et le message prime J+1 25 €.
 * - Le webhook Stripe se charge d'écrire subscription_started_at + crédit wallet.
 */
export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id: sessionId } = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  if (!sessionId) {
    redirect('/dashboard')
  }

  let summary: SessionSummary | null = null
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'total_details.breakdown.discounts.discount'],
    })
    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Le discount expose la coupon via une structure imbriquée — typée large côté SDK
      const discountRaw = session.total_details?.breakdown?.discounts?.[0]?.discount as
        | { coupon?: { id?: string; percent_off?: number | null } }
        | undefined
      const couponId = discountRaw?.coupon?.id ?? null
      const couponPercent = discountRaw?.coupon?.percent_off ?? null
      summary = {
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? 'eur',
        planLabel: (session.metadata?.plan ?? 'Plan') + ' ' + (session.metadata?.tier ?? ''),
        couponApplied: couponId,
        couponPercent,
      }
    }
  } catch {
    // Session introuvable ou expirée — on fallback sur un message générique
  }

  return <ConfirmationClient summary={summary} />
}
