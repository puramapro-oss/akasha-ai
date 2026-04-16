'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import {
  Users, Share2, Copy, Check, Crown, ArrowRight, Sparkles, Film,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { copyToClipboard } from '@/lib/utils'
import { APP_DOMAIN } from '@/lib/constants'

type AmbassadorTier = {
  id: string
  label: string
  min: number
  prime: number
  color: string
}

// Barème V7 SUPREME — 9 paliers Bronze 200€ → Éternel 200K€
const TIERS: AmbassadorTier[] = [
  { id: 'bronze',  label: 'Bronze',  min: 10,    prime: 200,    color: '#cd7f32' },
  { id: 'argent',  label: 'Argent',  min: 25,    prime: 500,    color: '#94a3b8' },
  { id: 'or',      label: 'Or',      min: 50,    prime: 1000,   color: '#f59e0b' },
  { id: 'platine', label: 'Platine', min: 100,   prime: 2500,   color: '#a855f7' },
  { id: 'diamant', label: 'Diamant', min: 250,   prime: 6000,   color: '#06b6d4' },
  { id: 'legende', label: 'Légende', min: 500,   prime: 12000,  color: '#f43f5e' },
  { id: 'titan',   label: 'Titan',   min: 1000,  prime: 25000,  color: '#8b5cf6' },
  { id: 'dieu',    label: 'Dieu',    min: 5000,  prime: 100000, color: '#eab308' },
  { id: 'eternel', label: 'Éternel', min: 10000, prime: 200000, color: '#fbbf24' },
]

// Cross-promo mapping AKASHA → SUTRA (primaire), MIDAS (fallback). V7 §15
const CROSS_PROMO = {
  primary: {
    slug: 'sutra',
    name: 'SUTRA',
    tagline: 'Éditeur vidéo IA — script, montage, voix en un clic',
    gradient: 'from-cyan-400 via-fuchsia-500 to-violet-600',
    icon: Film,
    url: 'https://sutra.purama.dev/go/akasha_ai?coupon=WELCOME50',
  },
  fallback: {
    slug: 'midas',
    name: 'MIDAS',
    tagline: 'Trading IA avec signaux temps réel',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    icon: Sparkles,
    url: 'https://midas.purama.dev/go/akasha_ai?coupon=WELCOME50',
  },
}

function formatNumber(n: number) {
  return n.toLocaleString('fr-FR')
}

export default function HomeBlocks() {
  const { user, profile } = useAuth()
  const [referralCount, setReferralCount] = useState<number>(0)
  const [totalCommissions, setTotalCommissions] = useState<number>(0)
  const [ambassadorTier, setAmbassadorTier] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | null>(null)
  const [loading, setLoading] = useState(true)

  const referralCode = profile?.referral_code ?? ''
  const referralLink = referralCode
    ? `https://${APP_DOMAIN}/go/${referralCode}`
    : `https://${APP_DOMAIN}/signup`

  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    const load = async () => {
      try {
        const [{ count: refCount }, commissionsRes, ambassadorRes] = await Promise.all([
          supabase
            .from('referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', user.id),
          supabase
            .from('commissions')
            .select('amount')
            .eq('referrer_id', user.id),
          supabase
            .from('influencer_profiles')
            .select('tier')
            .eq('user_id', user.id)
            .maybeSingle(),
        ])

        setReferralCount(refCount ?? 0)
        const sum = (commissionsRes.data ?? []).reduce(
          (acc, c) => acc + Number(c.amount ?? 0),
          0,
        )
        setTotalCommissions(sum)
        setAmbassadorTier((ambassadorRes.data?.tier as string) ?? null)
      } catch {
        /* silencieux — blocs restent avec valeurs par défaut */
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [user])

  useEffect(() => {
    if (!referralLink) return
    QRCode
      .toDataURL(referralLink, {
        margin: 1,
        width: 280,
        color: { dark: '#ffffff', light: '#00000000' },
      })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [referralLink])

  const handleCopy = async () => {
    const ok = await copyToClipboard(referralLink)
    if (ok) {
      setCopied('link')
      toast.success('Lien copié')
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Découvre AKASHA AI',
          text: 'L\'agrégateur multi-IA le plus complet. Tu vas adorer.',
          url: referralLink,
        })
      } catch {
        /* utilisateur a annulé */
      }
    } else {
      await handleCopy()
    }
  }

  // Barème V7 — palier courant + suivant
  const tierIndex = Math.max(0, TIERS.findIndex(t => t.id === ambassadorTier))
  const currentTier = ambassadorTier ? TIERS[tierIndex] : null
  const nextTier = currentTier ? TIERS[tierIndex + 1] : TIERS[0]
  const tierTarget = nextTier ?? TIERS[TIERS.length - 1]
  const progressPct = tierTarget
    ? Math.min(100, Math.round((referralCount / tierTarget.min) * 100))
    : 0

  const promo = CROSS_PROMO.primary
  const PromoIcon = promo.icon

  return (
    <section
      aria-label="Parrainage, Ambassadeur et Cross-Promo"
      className="grid gap-4 lg:grid-cols-3"
    >
      {/* ═══ BLOC 1 — PARRAINAGE ═══ */}
      <div className="card relative overflow-hidden p-5">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-[var(--cyan)]/20 to-transparent blur-2xl" />

        <div className="relative flex items-start justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Users className="h-3 w-3" />
              Parrainage
            </div>
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {referralCount > 0
                ? `${referralCount} ami${referralCount > 1 ? 's' : ''} invité${referralCount > 1 ? 's' : ''}`
                : 'Invite tes amis, gagne des commissions'}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {referralCount > 0
                ? `${totalCommissions.toFixed(2)} € générés · 50 % N1 + 15 % N2 + 7 % N3 à vie`
                : 'Ton premier filleul te rapporte des commissions à vie.'}
            </p>
          </div>
          {qrDataUrl && (
            <div
              aria-hidden
              className="hidden flex-shrink-0 rounded-lg border border-white/10 bg-white/[0.02] p-1.5 sm:block"
            >
              <Image
                src={qrDataUrl}
                width={56}
                height={56}
                alt=""
                className="h-14 w-14"
                unoptimized
              />
            </div>
          )}
        </div>

        <div className="relative mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 truncate rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--cyan)]">
            <span className="truncate font-mono">{loading ? '…' : referralLink}</span>
          </div>
          <button
            onClick={handleCopy}
            aria-label="Copier le lien de parrainage"
            data-testid="home-copy-referral"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08]"
          >
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleShare}
            aria-label="Partager mon lien"
            data-testid="home-share-referral"
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-3 text-xs font-semibold text-white transition-all hover:brightness-110"
          >
            <Share2 className="h-3.5 w-3.5" />
            Partager
          </button>
        </div>
      </div>

      {/* ═══ BLOC 2 — AMBASSADEUR ═══ */}
      <Link
        href="/dashboard/ambassadeur"
        data-testid="home-ambassadeur-block"
        className="card group relative overflow-hidden p-5 transition-all hover:border-amber-500/30"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-amber-500/20 to-transparent blur-2xl" />

        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <Crown className="h-3 w-3" />
            Programme Ambassadeur
          </div>

          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            {currentTier
              ? `${currentTier.label} — prime ${formatNumber(currentTier.prime)} €`
              : 'Deviens Ambassadeur AKASHA'}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {currentTier
              ? `Prochain palier : ${tierTarget.label} (${tierTarget.min} filleuls) → ${formatNumber(tierTarget.prime)} €`
              : `De Bronze 200 € à Éternel 200 000 €. Ton premier palier à ${TIERS[0].min} filleuls.`}
          </p>

          {/* Barre progression vers palier cible */}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
              {referralCount}/{tierTarget.min}
            </span>
          </div>

          {/* Mini timeline paliers */}
          <div className="mt-3 flex gap-1">
            {TIERS.slice(0, 6).map((t) => {
              const reached = currentTier ? tierIndex >= TIERS.indexOf(t) : false
              return (
                <div
                  key={t.id}
                  title={`${t.label} — ${formatNumber(t.prime)} €`}
                  className="h-1.5 flex-1 rounded-full transition-all"
                  style={{ backgroundColor: reached ? t.color : 'rgba(255,255,255,0.06)' }}
                />
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            {currentTier ? 'Voir mon dashboard' : 'Postuler comme Ambassadeur'}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>

      {/* ═══ BLOC 3 — CROSS-PROMO SUTRA ═══ */}
      <a
        href={promo.url}
        data-testid="home-cross-promo"
        rel="noopener"
        className="card group relative overflow-hidden p-5 transition-all hover:border-[var(--purple)]/30"
      >
        <div
          className={`absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br ${promo.gradient} opacity-30 blur-2xl`}
        />

        <div className="relative">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--purple)]/20 bg-[var(--purple)]/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--purple)]">
              <Sparkles className="h-3 w-3" />
              Offre Purama
            </div>
            <span className="rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-2 py-0.5 text-[10px] font-bold text-white">
              -50 %
            </span>
          </div>

          <div className="flex items-start gap-3">
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${promo.gradient} shadow-lg`}
            >
              <PromoIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Découvre {promo.name}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                {promo.tagline}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--cyan)]/20 bg-[var(--cyan)]/5 px-3 py-2 text-xs">
            <p className="font-semibold text-[var(--cyan)]">-50 % le 1ᵉʳ mois + 100 € de prime</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Code auto-appliqué — rien à taper
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[var(--purple)]">
            Essayer {promo.name}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </a>
    </section>
  )
}
