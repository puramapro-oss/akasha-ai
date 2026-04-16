import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

/**
 * V7 SUPREME §15 — Route universelle de promotion cross-app.
 *
 * Flow :
 *   1. /go/[source]?coupon=WELCOME50  → pose cookie purama_promo (7j, HttpOnly)
 *   2. Si [source] correspond à un referral_code ou un slug ambassadeur → redirect /signup?ref=[slug]
 *   3. Sinon → redirect /signup (avec le cookie en stock)
 *   4. Plus tard, /subscribe lit le cookie et applique le coupon Stripe automatiquement.
 *
 * Tracking : une ligne cross_promos est créée à chaque clic avec source_app / target_app / coupon_code.
 */
export default async function GoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ coupon?: string; utm_source?: string; utm_medium?: string }>
}) {
  const { slug } = await params
  const { coupon } = await searchParams

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'akasha_ai' } }
  )

  // 1) Pose le cookie purama_promo si un coupon est fourni (ex: WELCOME50)
  if (coupon) {
    const cookieStore = await cookies()
    const payload = JSON.stringify({
      coupon,
      source: slug,
      set_at: Date.now(),
    })
    cookieStore.set('purama_promo', payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 jours
    })
  }

  // 2) Log le clic dans cross_promos (tracking V7) — non bloquant, fire-and-forget
  try {
    await supabase.from('cross_promos').insert({
      source_app: slug,
      target_app: 'akasha_ai',
      coupon_code: coupon ?? null,
      coupon_used: coupon ?? null,
      clicked_at: new Date().toISOString(),
      converted: false,
      used: false,
    })
  } catch {
    // Silencieux : un échec de tracking ne doit jamais casser la redirection.
  }

  // 3) Lookup referral code (parrainage classique)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, referral_code')
    .eq('referral_code', slug)
    .maybeSingle()

  if (profile) {
    redirect(`/signup?ref=${encodeURIComponent(slug)}`)
  }

  // 4) Lookup ambassadeur slug
  const { data: ambassador } = await supabase
    .from('influencer_profiles')
    .select('user_id, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (ambassador) {
    redirect(`/signup?ref=${encodeURIComponent(slug)}`)
  }

  // 5) Slug inconnu (ex : autre app Purama comme "sutra") — redirect /signup avec cookie conservé
  redirect('/signup')
}
