'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  MessageSquare, Wrench, Bot, Zap, Sparkles, Flame, Star, ArrowRight,
  Film, BarChart3,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import Skeleton from '@/components/ui/Skeleton'
import HomeBlocks from '@/components/home/HomeBlocks'
import { cn, formatNumber } from '@/lib/utils'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
}
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  automate: 'AUTOMATE',
  create: 'CREATE',
  build: 'BUILD',
  complete: 'COMPLET',
}

export default function DashboardPage() {
  const { profile, loading } = useAuth()
  const t = useTranslations('dashboard')
  const tn = useTranslations('nav')

  const QUICK_ACTIONS = [
    {
      href: '/dashboard/chat',
      icon: MessageSquare,
      label: tn('chat'),
      desc: 'Pose une question, obtiens une reponse instantanee',
      color: 'var(--cyan)',
    },
    {
      href: '/dashboard/studio',
      icon: Film,
      label: tn('studio'),
      desc: 'Genere images, videos et sons en quelques secondes',
      color: 'var(--pink)',
    },
    {
      href: '/dashboard/tools',
      icon: Wrench,
      label: tn('tools'),
      desc: 'Explore tous les outils IA disponibles',
      color: 'var(--purple)',
    },
    {
      href: '/dashboard/agents',
      icon: Bot,
      label: tn('agents'),
      desc: 'Cree des agents qui travaillent pour toi',
      color: 'var(--gold)',
    },
  ]

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const name = profile?.display_name ?? profile?.email?.split('@')[0] ?? ''
  const xp = profile?.xp ?? 0
  const level = profile?.level ?? 1
  const streak = profile?.streak_count ?? 0
  const plan = profile?.plan ?? 'free'
  const dailyQuestions = profile?.daily_questions ?? 0

  // XP progress to next level (every 100 XP = 1 level)
  const xpToNext = 100
  const xpInLevel = xp % xpToNext
  const progressPct = Math.min(100, (xpInLevel / xpToNext) * 100)

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="flex flex-col gap-6 lg:gap-8"
    >
      {/* ─── 3 blocs V7 SUPREME above-the-fold (Parrainage + Ambassadeur + Cross-Promo) ─── */}
      <motion.div variants={fadeUp}>
        <HomeBlocks />
      </motion.div>

      {/* ─── Hero card ────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -inset-x-20 -top-20 h-40 bg-gradient-to-r from-[var(--cyan)]/12 via-[var(--purple)]/12 to-[var(--pink)]/12 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('welcome', { name })}
              </h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Niveau <span className="font-semibold text-[var(--text-primary)]">{level}</span>
                <span className="mx-2 text-[var(--text-muted)]">·</span>
                <span className="font-semibold text-[var(--cyan)]">{formatNumber(xp)} XP</span>
                <span className="mx-2 text-[var(--text-muted)]">·</span>
                <span className="font-semibold text-[var(--text-primary)]">{PLAN_LABEL[plan] ?? 'Free'}</span>
              </p>
              {/* XP progress */}
              <div className="mt-4 max-w-sm">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>Prochain niveau</span>
                  <span>{xpInLevel} / {xpToNext} XP</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-card)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-3 sm:flex-col sm:items-end">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
                <Flame className="h-4 w-4 text-[var(--orange)]" />
                <span className="text-[var(--text-secondary)]">
                  Streak <span className="font-semibold text-[var(--text-primary)]">{streak}</span>
                </span>
              </div>
              <Link
                href="/dashboard/chat"
                className="btn btn-primary text-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Nouveau chat
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── Quick actions ────────────────────────────────────────────── */}
      <motion.section variants={fadeUp}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            {t('quickActions')}
          </h2>
          <Link href="/dashboard/tools" className="text-xs text-[var(--cyan)] hover:underline">
            Tout voir &rarr;
          </Link>
        </div>
        <motion.div
          variants={stagger}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {QUICK_ACTIONS.map(({ href, icon: Icon, label, desc, color }) => (
            <motion.div key={href} variants={fadeUp}>
              <Link href={href} data-testid={`quick-action-${href.split('/').pop()}`}>
                <div className="card card-hover group h-full p-5">
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: `${color}14`,
                      border: `1px solid ${color}33`,
                      color,
                    }}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                    {label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {desc}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] transition-colors group-hover:text-[var(--cyan)]">
                    Ouvrir
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ─── Stats ────────────────────────────────────────────────────── */}
      <motion.section variants={fadeUp}>
        <h2 className="mb-4 font-display text-base font-semibold text-[var(--text-primary)]">
          Statistiques
        </h2>
        <motion.div variants={stagger} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            variants={fadeUp}
            icon={MessageSquare}
            color="var(--cyan)"
            value={formatNumber(dailyQuestions)}
            label={t('todayCredits')}
          />
          <StatCard
            variants={fadeUp}
            icon={BarChart3}
            color="var(--gold)"
            value={formatNumber(xp)}
            label="XP total"
          />
          <StatCard
            variants={fadeUp}
            icon={Star}
            color="var(--purple)"
            value={String(level)}
            label="Niveau"
          />
        </motion.div>
      </motion.section>
    </motion.div>
  )
}

function StatCard({
  icon: Icon,
  color,
  value,
  label,
  variants,
}: {
  icon: React.ComponentType<{ className?: string }>
  color: string
  value: string
  label: string
  variants: typeof fadeUp
}) {
  return (
    <motion.div variants={variants}>
      <div className="card flex items-center gap-4 p-5">
        <div
          className={cn('flex h-11 w-11 items-center justify-center rounded-xl')}
          style={{
            background: `${color}14`,
            border: `1px solid ${color}33`,
            color,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{label}</p>
        </div>
      </div>
    </motion.div>
  )
}
