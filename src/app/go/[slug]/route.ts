import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * V7 SUPREME §15 — Route universelle de promotion cross-app.
 *
 * F1 FIX (T6, 2026-09-22, finding transverse QA-T5/T7/T8 — même classe que
 * jyoti/dridha/lumios/forge/bala) : converti de Server Component `page.tsx`
 * en Route Handler. `cookies().set()` est interdit pendant le rendu d'une
 * page (Next 13.4+) — le poseur en page.tsx levait un 500 déterministe sur
 * CHAQUE clic `/go/{slug}?coupon=X` (le cas sans coupon ne posait aucun
 * cookie et ne déclenchait donc pas le crash, ce qui masquait le bug pour
 * la majorité des liens de parrainage classiques). Logique 100% préservée,
 * seul le mécanisme de pose du cookie change (sur la Response, pas via
 * `cookies()` importé de `next/headers`).
 *
 * Flow :
 *   1. /go/[source]?coupon=WELCOME50  → pose cookie purama_promo (7j, HttpOnly)
 *   2. Si [source] correspond à un referral_code ou un slug ambassadeur → redirect /signup?ref=[slug]
 *   3. Sinon → redirect /signup (avec le cookie en stock)
 *   4. Plus tard, /subscribe lit le cookie et applique le coupon Stripe automatiquement.
 *
 * Tracking : une ligne cross_promos est créée à chaque clic avec source_app / target_app / coupon_code.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const coupon = searchParams.get('coupon') ?? undefined

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'akasha_ai' } }
  )

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

  // 3) Lookup referral code (parrainage classique) / 4) Lookup ambassadeur slug
  const [{ data: profile }, { data: ambassador }] = await Promise.all([
    supabase.from('profiles').select('id, referral_code').eq('referral_code', slug).maybeSingle(),
    supabase.from('influencer_profiles').select('user_id, slug').eq('slug', slug).maybeSingle(),
  ])

  const dest = new URL(
    profile || ambassador ? `/signup?ref=${encodeURIComponent(slug)}` : '/signup',
    request.url
  )
  const res = NextResponse.redirect(dest)

  // 1) Pose le cookie purama_promo si un coupon est fourni (ex: WELCOME50)
  if (coupon) {
    const payload = JSON.stringify({
      coupon,
      source: slug,
      set_at: Date.now(),
    })
    res.cookies.set('purama_promo', payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 jours
    })
  }

  return res
}
