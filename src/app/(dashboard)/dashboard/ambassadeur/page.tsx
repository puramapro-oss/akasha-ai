'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, TrendingUp, Wallet, Link2, Copy, BarChart3,
  Award, Star, Check, ArrowUpRight,
  Crown, Megaphone, BookOpen, Eye, MousePointerClick,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import Tabs from '@/components/ui/Tabs'
import { cn, formatNumber, copyToClipboard, formatDate } from '@/lib/utils'
import { APP_DOMAIN } from '@/lib/constants'

interface AmbassadorData {
  slug: string
  bio: string | null
  social_links: Record<string, string>
  approved: boolean
  tier: string
  kit_downloaded: boolean
  created_at: string
}

interface Stats {
  clicks: number
  signups: number
  conversions: number
  revenue: number
  conversion_rate: number
}

interface CommissionRow {
  id: string
  amount: number
  type: string
  status: string
  created_at: string
  referred?: { display_name: string | null }
}

// Barème V7 SUPREME — 9 paliers de Bronze 200€ à Éternel 200K€
const AMBASSADOR_TIERS = [
  { id: 'bronze',  label: 'Bronze',  min: 10,    prime: 200,    color: '#cd7f32', perk: 'Kit ambassadeur + badge' },
  { id: 'argent',  label: 'Argent',  min: 25,    prime: 500,    color: '#94a3b8', perk: 'Early access + page perso' },
  { id: 'or',      label: 'Or',      min: 50,    prime: 1000,   color: '#f59e0b', perk: 'Plan offert + page publique' },
  { id: 'platine', label: 'Platine', min: 100,   prime: 2500,   color: '#a855f7', perk: 'Priorité features + événements' },
  { id: 'diamant', label: 'Diamant', min: 250,   prime: 6000,   color: '#06b6d4', perk: 'Accès VIP + coach dédié' },
  { id: 'legende', label: 'Légende', min: 500,   prime: 12000,  color: '#f43f5e', perk: 'Commissions héréditaires' },
  { id: 'titan',   label: 'Titan',   min: 1000,  prime: 25000,  color: '#8b5cf6', perk: 'Ligne directe + beta' },
  { id: 'dieu',    label: 'Dieu',    min: 5000,  prime: 100000, color: '#eab308', perk: 'Parts ecosystème' },
  { id: 'eternel', label: 'Éternel', min: 10000, prime: 200000, color: '#fbbf24', perk: '1% parts + transmissible' },
] as const

export default function AmbassadeurPage() {
  const { user, profile } = useAuth()
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null)
  const [stats, setStats] = useState<Stats>({ clicks: 0, signups: 0, conversions: 0, revenue: 0, conversion_rate: 0 })
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [tab, setTab] = useState('stats')
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!user) return

    const { data: inf } = await supabase
      .from('influencer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (inf) {
      setAmbassador(inf as AmbassadorData)

      const [statsRes, commissionsRes] = await Promise.all([
        supabase.from('influencer_stats').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('commissions').select('id, amount, type, status, created_at').eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(50),
      ])

      if (statsRes.data) setStats(statsRes.data as Stats)
      if (commissionsRes.data) setCommissions(commissionsRes.data as CommissionRow[])
    }

    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    load()
  }, [load])

  const register = async () => {
    if (!user || !profile) return
    setRegistering(true)

    const slug = (profile.display_name ?? profile.email ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 20) + '-' + Math.random().toString(36).slice(2, 6)

    const { error } = await supabase.from('influencer_profiles').insert({
      user_id: user.id,
      slug,
      bio: null,
      social_links: {},
      approved: true,
      tier: 'bronze',
    })

    if (error) {
      toast.error('Impossible de créer ton profil Ambassadeur')
    } else {
      await supabase.from('influencer_stats').insert({ user_id: user.id })
      toast.success('Bienvenue dans le programme Ambassadeur !')
      load()
    }
    setRegistering(false)
  }

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(label)
      toast.success(`${label} copié`)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Not registered yet
  if (!ambassador) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="text-center">
          <Megaphone className="mx-auto h-16 w-16 text-[var(--cyan)]" />
          <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">
            Deviens Ambassadeur AKASHA
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[var(--text-secondary)]">
            Rejoins le programme en 1 clic. Primes cumulables jusqu&apos;à 200 000 € selon ton palier.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Link2, label: 'Lien unique', desc: 'Ton lien /go/[slug] personnalisé' },
            { icon: Award, label: '9 paliers', desc: 'De Bronze 200 € à Éternel 200 K €' },
            { icon: Wallet, label: 'Versement auto', desc: 'Prime créditée à chaque palier' },
          ].map(({ icon: Icon, label, desc }) => (
            <Card key={label} className="p-4 text-center">
              <Icon className="mx-auto mb-2 h-8 w-8 text-[var(--cyan)]" />
              <p className="font-medium text-[var(--text-primary)]">{label}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{desc}</p>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Paliers &amp; primes</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AMBASSADOR_TIERS.map(({ label, min, prime, color }) => (
              <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <p className="text-sm font-bold" style={{ color }}>{label}</p>
                <p className="text-xs text-[var(--text-muted)]">{min}+ filleuls</p>
                <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{formatNumber(prime)} €</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="text-center">
          <Button onClick={register} disabled={registering} size="lg">
            {registering ? 'Inscription…' : 'Postuler comme Ambassadeur'}
          </Button>
        </div>
      </div>
    )
  }

  // Dashboard Ambassadeur
  const goLink = `https://${APP_DOMAIN}/go/${ambassador.slug}`
  const profileLink = `https://${APP_DOMAIN}/p/${ambassador.slug}`
  const currentTier = AMBASSADOR_TIERS.find(t => t.id === ambassador.tier) ?? AMBASSADOR_TIERS[0]
  const currentIdx = AMBASSADOR_TIERS.findIndex(t => t.id === currentTier.id)
  const nextTier = AMBASSADOR_TIERS[currentIdx + 1] ?? null
  const totalCommissions = commissions.reduce((acc, c) => acc + c.amount, 0)
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((acc, c) => acc + c.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Megaphone className="h-7 w-7 text-[var(--cyan)]" />
            Dashboard Ambassadeur
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="cyan">
              {currentTier.label}
            </Badge>
            <span className="text-sm text-[var(--text-muted)]">
              Prime palier : {formatNumber(currentTier.prime)} €
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-[var(--cyan)]" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Clics</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatNumber(stats.clicks)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Inscriptions</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatNumber(stats.signups)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <MousePointerClick className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Conversions</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatNumber(stats.conversions)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Revenus total</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{stats.revenue.toFixed(2)} €</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tier progress */}
      {nextTier && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5" style={{ color: currentTier.color }} />
              <span className="text-sm text-[var(--text-primary)]">
                {currentTier.label} → {nextTier.label}
              </span>
            </div>
            <span className="text-sm text-[var(--text-muted)]">
              {stats.signups}/{nextTier.min} filleuls — prime {formatNumber(nextTier.prime)} €
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (stats.signups / nextTier.min) * 100)}%`,
                backgroundColor: nextTier.color,
              }}
            />
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'stats', label: 'Liens & Outils' },
          { id: 'commissions', label: 'Commissions' },
          { id: 'paliers', label: 'Paliers' },
          { id: 'academy', label: 'Academy' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'stats' && (
          <div className="space-y-4">
            {/* Links */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Tes liens</h3>
              <div className="space-y-3">
                {[
                  { label: 'Lien de parrainage', url: goLink },
                  { label: 'Page publique', url: profileLink },
                ].map(({ label, url }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                      <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
                      <code className="flex-1 truncate text-sm text-[var(--cyan)]">{url}</code>
                    </div>
                    <button
                      onClick={() => handleCopy(url, label)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
                      aria-label={`Copier ${label}`}
                    >
                      {copied === label ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            {/* Share templates */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Templates de partage</h3>
              <div className="space-y-2">
                {[
                  `Découvre AKASHA AI, l'agrégateur multi-IA le plus complet ! ${goLink}`,
                  `J'utilise AKASHA AI pour mes projets et c'est incroyable. Teste-le : ${goLink}`,
                  `Chat IA, génération d'images/vidéos/code, agents personnalisés... tout en un sur AKASHA AI ${goLink}`,
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <p className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-[var(--text-secondary)]">
                      {text}
                    </p>
                    <button
                      onClick={() => handleCopy(text, `Template ${i + 1}`)}
                      className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-white/5 transition-colors"
                      aria-label={`Copier template ${i + 1}`}
                    >
                      {copied === `Template ${i + 1}` ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
      )}

      {tab === 'commissions' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <p className="text-xs text-[var(--text-muted)]">Total commissions</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{totalCommissions.toFixed(2)} €</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-[var(--text-muted)]">En attente</p>
                <p className="text-2xl font-bold text-yellow-400">{pendingCommissions.toFixed(2)} €</p>
              </Card>
            </div>

            <Card className="p-0">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h3 className="font-semibold text-[var(--text-primary)]">Historique</h3>
              </div>
              {commissions.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  Aucune commission pour le moment
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
                  {commissions.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                      <ArrowUpRight className="h-4 w-4 text-green-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text-primary)]">
                          Commission {c.type}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{formatDate(c.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-400">+{c.amount.toFixed(2)} €</p>
                        <Badge variant={c.status === 'paid' ? 'green' : 'default'} className="text-[10px]">
                          {c.status === 'paid' ? 'Payé' : 'En attente'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
      )}

      {tab === 'paliers' && (
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Paliers Ambassadeur</h3>
              <div className="space-y-2">
                {AMBASSADOR_TIERS.map((tier) => {
                  const tierIdx = AMBASSADOR_TIERS.findIndex(t => t.id === tier.id)
                  const isActive = tier.id === ambassador.tier
                  const isPassed = tierIdx < currentIdx
                  return (
                    <div
                      key={tier.id}
                      className={cn(
                        'flex items-center gap-4 rounded-xl border p-4 transition-all',
                        isActive ? 'border-[var(--cyan)]/30 bg-[var(--cyan)]/5' :
                        isPassed ? 'border-green-500/20 bg-green-500/5' :
                        'border-white/[0.06] bg-white/[0.02]'
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${tier.color}20` }}>
                        <Star className="h-5 w-5" style={{ color: tier.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-[var(--text-primary)]">{tier.label}</p>
                          {isActive && <Badge variant="default">Actuel</Badge>}
                          {isPassed && <Badge variant="green">Atteint</Badge>}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {tier.min}+ filleuls — {tier.perk}
                        </p>
                      </div>
                      <span className="text-lg font-bold" style={{ color: tier.color }}>
                        {formatNumber(tier.prime)} €
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
      )}

      {tab === 'academy' && (
          <div className="space-y-4">
            {[
              { level: 1, title: 'Les bases', duration: '2h', topics: ['Créer ton lien', 'Partager efficacement', 'Comprendre les commissions', 'Optimiser ton profil'], unlocked: true },
              { level: 2, title: 'Stratégie avancée', duration: '6h', topics: ['Audience cible', 'Contenu qui convertit', 'Réseaux sociaux', 'Storytelling'], unlocked: stats.signups >= 25 },
              { level: 3, title: 'Expert', duration: '12h', topics: ['Automatisation', 'Partenariats', 'Revenue passif', 'Scale'], unlocked: stats.signups >= 50 },
            ].map(({ level, title, duration, topics, unlocked }) => (
              <Card key={level} className={cn('p-5', !unlocked && 'opacity-60')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold',
                      unlocked ? 'bg-[var(--cyan)]/20 text-[var(--cyan)]' : 'bg-white/10 text-[var(--text-muted)]'
                    )}>
                      N{level}
                    </div>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{title}</p>
                      <p className="text-xs text-[var(--text-muted)]">{duration} — {topics.length} modules</p>
                    </div>
                  </div>
                  <Badge variant={unlocked ? 'green' : 'default'}>
                    {unlocked ? 'Disponible' : 'Verrouillé'}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-1">
                  {topics.map((topic) => (
                    <li key={topic} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <BookOpen className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {topic}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
      )}

      {/* Parrainage direct 3 niveaux info (V7 SUPREME §20) */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 h-5 w-5 text-[var(--cyan)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              En plus des paliers, tu touches des commissions à vie
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Niveau 1 (filleul direct) : <span className="font-semibold text-[var(--text-primary)]">50 %</span> de l&apos;abonnement à vie · Niveau 2 : <span className="font-semibold text-[var(--text-primary)]">15 %</span> · Niveau 3 : <span className="font-semibold text-[var(--text-primary)]">7 %</span>. Commission après 30 jours d&apos;activité réelle du filleul.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
