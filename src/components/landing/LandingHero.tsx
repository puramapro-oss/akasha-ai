'use client'

import Link from 'next/link'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  ArrowRight, Lock,
  MessageSquare, Image as ImageIcon, Bot, Workflow, Code2, Mic, Sparkles,
} from 'lucide-react'

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-20%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,212,255,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute right-[-10%] top-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(255,93,143,0.14),transparent_60%)] blur-3xl" />
    </div>
  )
}

export default function Hero() {
  const { scrollY } = useScroll()
  const mockupY = useTransform(scrollY, [0, 400], [0, -40])
  const mockupScale = useTransform(scrollY, [0, 400], [1, 0.96])

  return (
    <section className="relative z-10 px-6 pt-36 pb-16 sm:pt-44 sm:pb-24 lg:pt-52 lg:pb-32">
      <HeroBackdrop />
      <div className="relative mx-auto max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[12px] font-medium text-white/70 backdrop-blur-md"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
          </span>
          L&apos;ecosysteme IA tout-en-un
          <ArrowRight className="h-3 w-3 opacity-60" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05 }}
          className="font-display text-[2.8rem] font-bold leading-[0.98] tracking-[-0.035em] text-white sm:text-[4rem] md:text-[5rem] lg:text-[5.75rem]"
        >
          Tous tes outils IA.
          <br />
          <span className="bg-gradient-to-br from-white via-[var(--cyan-soft)] to-[var(--purple)] bg-clip-text text-transparent">
            Un seul abonnement.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-8 max-w-2xl text-[17px] leading-[1.55] text-white/60 sm:text-lg"
        >
          Chat multi-modeles, generation d&apos;images, agents autonomes, automatisations.
          Une plateforme. Un prix. Sans compromis.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/signup"
            data-testid="hero-cta-signup"
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 text-[15px] font-semibold text-[#0A0A0F] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_16px_50px_-10px_rgba(255,255,255,0.55)] sm:w-auto"
          >
            Commencer gratuitement
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-7 text-[15px] font-semibold text-white backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.06] sm:w-auto"
          >
            Voir les fonctionnalites
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 text-[12px] text-[var(--text-muted)]"
        >
          Sans carte bancaire &middot; Resiliation en 1 clic &middot; Hebergement Europe
        </motion.p>

        {/* Hero visual — iOS-style stacked dashboard */}
        <motion.div
          style={{ y: mockupY, scale: mockupScale }}
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-20"
        >
          {/* Floating side cards (desktop only) */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-8 top-12 z-20 hidden w-52 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] lg:block"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--cyan)]/15 text-[var(--cyan)]">
                <ImageIcon className="h-4 w-4" />
              </div>
              <span className="text-[12px] font-semibold text-white">Studio</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg bg-gradient-to-br from-[var(--cyan)]/20 via-[var(--purple)]/20 to-[var(--pink)]/20"
                  style={{ opacity: 0.4 + i * 0.1 }}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -right-6 top-32 z-20 hidden w-56 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] lg:block"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--purple)]/15 text-[var(--purple)]">
                <Bot className="h-4 w-4" />
              </div>
              <span className="text-[12px] font-semibold text-white">Agent actif</span>
              <span className="ml-auto flex h-2 w-2 rounded-full bg-[var(--green)] shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            </div>
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]" />
              </div>
              <div className="text-[11px] text-white/50">72% · 14 taches</div>
            </div>
          </motion.div>

          {/* Main mockup */}
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute -inset-8 rounded-[32px] bg-gradient-to-r from-[var(--cyan)]/20 via-[var(--purple)]/20 to-[var(--pink)]/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#0f1219] to-[#0a0c12] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]">
              {/* Traffic lights */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3.5">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="mx-auto flex items-center gap-1.5 rounded-lg bg-black/30 px-3 py-1 text-[11px] text-white/50">
                  <Lock className="h-3 w-3" />
                  akasha.purama.dev
                </div>
              </div>

              {/* Content */}
              <div className="grid grid-cols-[200px_1fr]">
                {/* Sidebar */}
                <div className="border-r border-white/[0.06] bg-white/[0.01] p-4">
                  <div className="mb-5 flex items-center gap-2 px-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)]">
                      <span className="text-[10px] font-bold text-white">A</span>
                    </div>
                    <span className="font-display text-[13px] font-semibold text-white">AKASHA</span>
                  </div>
                  <div className="space-y-0.5">
                    {[
                      { icon: MessageSquare, label: 'Chat', active: true },
                      { icon: ImageIcon, label: 'Studio' },
                      { icon: Bot, label: 'Agents' },
                      { icon: Workflow, label: 'Workflows' },
                      { icon: Code2, label: 'Code' },
                      { icon: Mic, label: 'Voix' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium ${
                          item.active
                            ? 'bg-white/[0.06] text-white'
                            : 'text-white/50 hover:text-white/80'
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chat preview */}
                <div className="flex min-h-[340px] flex-col gap-3 p-6">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                    <Sparkles className="h-3 w-3 text-[var(--cyan)]" />
                    AKASHA Sonnet · en ligne
                  </div>
                  <div className="flex flex-1 flex-col gap-3">
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(0,212,255,0.5)]">
                        Resume cet article en 3 points cles
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 backdrop-blur-sm">
                        <div className="space-y-1.5">
                          <div className="text-white">Voici les 3 points cles :</div>
                          <div>1. Approche modulaire et performante</div>
                          <div>2. Benchmarks : +40% vs baseline</div>
                          <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--cyan)]" />
                            ecriture en cours
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
                    <input
                      type="text"
                      readOnly
                      placeholder="Pose ta question..."
                      className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
                    />
                    <button className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] shadow-[0_4px_12px_-2px_rgba(0,212,255,0.5)]" aria-label="Envoyer">
                      <ArrowRight className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
