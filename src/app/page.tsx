'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  ArrowRight, Check, ChevronDown, Menu, X,
  MessageSquare, Image as ImageIcon, Bot, Workflow, Code2, Mic,
  Shield, Sparkles, Zap, Layers, Globe, Cpu, Lock,
} from 'lucide-react'

/* ─── Reveal wrapper ──────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  className = '',
  y = 24,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { href: '#features', label: 'Fonctionnalites' },
    { href: '#tools', label: 'Outils' },
    { href: '#pricing', label: 'Tarifs' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <nav
      className={`fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-5xl -translate-x-1/2 transition-all duration-500 ${
        scrolled ? 'top-3' : 'top-4'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 transition-all duration-500 sm:px-5 ${
          scrolled
            ? 'border-white/10 bg-[#0b0d14]/70 backdrop-blur-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]'
            : 'border-white/[0.06] bg-white/[0.03] backdrop-blur-xl'
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] shadow-[0_6px_20px_-4px_rgba(0,212,255,0.5)]">
            <span className="font-display text-sm font-bold text-white">A</span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 to-transparent" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-white">AKASHA</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-white/60 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="px-3 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white">
            Connexion
          </Link>
          <Link
            href="/signup"
            data-testid="nav-cta-signup"
            className="group flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#0A0A0F] shadow-[0_4px_14px_-2px_rgba(255,255,255,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_6px_20px_-2px_rgba(255,255,255,0.4)]"
          >
            Essayer
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/5 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d14]/90 backdrop-blur-2xl md:hidden"
          >
            <div className="flex flex-col gap-1 p-3">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-[14px] font-medium text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <Link href="/login" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center text-[13px] font-semibold text-white">
                  Connexion
                </Link>
                <Link href="/signup" className="rounded-xl bg-white px-4 py-2.5 text-center text-[13px] font-semibold text-[#0A0A0F]">
                  Essayer
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

/* ─── Floating orbs behind hero ───────────────────────────────────────── */
function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-20%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,212,255,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute right-[-10%] top-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(255,93,143,0.14),transparent_60%)] blur-3xl" />
    </div>
  )
}

/* ─── Hero ────────────────────────────────────────────────────────────── */
function Hero() {
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

/* ─── Features ────────────────────────────────────────────────────────── */
function Features() {
  const features = [
    { icon: MessageSquare, color: 'var(--cyan)', title: 'Chat multi-modeles', desc: 'Discute avec Sonnet, Opus et Haiku. Compare, choisis la meilleure reponse.' },
    { icon: ImageIcon, color: 'var(--pink)', title: 'Studio creatif', desc: 'Images, videos et sons depuis une seule interface. Modeles SOTA inclus.' },
    { icon: Bot, color: 'var(--purple)', title: 'Agents autonomes', desc: 'Des agents IA qui executent des taches en arriere-plan, 24 h/24.' },
    { icon: Workflow, color: 'var(--green)', title: 'Automatisations', desc: 'Connecte tes outils, declenche des workflows, automatise tes processus.' },
    { icon: Code2, color: 'var(--orange)', title: 'Outils developpeurs', desc: 'Genere du code, debogue, deploie. API REST pour tout integrer.' },
    { icon: Mic, color: 'var(--gold)', title: 'Voix & transcription', desc: 'Synthese vocale naturelle, transcription temps reel, traduction live.' },
  ]

  return (
    <section id="features" className="relative z-10 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            <Sparkles className="h-3 w-3 text-[var(--cyan)]" />
            Fonctionnalites
          </div>
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3rem] lg:text-[3.5rem]">
            Tout ce qu&apos;il te faut.
            <br />
            <span className="bg-gradient-to-br from-white via-[var(--cyan-soft)] to-[var(--purple)] bg-clip-text text-transparent">
              Au meme endroit.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/60">
            Chaque outil est concu pour s&apos;integrer parfaitement aux autres.
            Plus de copier-coller entre dix applications.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <div className="group relative h-full overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02] p-7 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-white/10 hover:bg-white/[0.04]">
                <div
                  className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: `radial-gradient(600px circle at 50% 0%, ${f.color}22, transparent 40%)` }}
                />
                <div
                  className="relative mb-6 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: `${f.color}14`, border: `1px solid ${f.color}33`, color: f.color, boxShadow: `0 8px 24px -10px ${f.color}66` }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="relative font-display text-[18px] font-semibold tracking-tight text-white">{f.title}</h3>
                <p className="relative mt-2 text-[14px] leading-relaxed text-white/55">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Tools (universes) ───────────────────────────────────────────────── */
function Tools() {
  const universes = [
    { key: 'automate', label: 'AUTOMATE', color: 'var(--cyan)', desc: 'Workflows, agents et integrations pour deleguer tes taches repetitives.', items: ['Workflows visuels', 'Agents autonomes', 'Webhooks', 'Cron jobs', 'API integrations'] },
    { key: 'create', label: 'CREATE', color: 'var(--pink)', desc: 'Studio creatif complet. Du concept a la production en quelques minutes.', items: ['Generation d\'images', 'Video AI', 'Synthese vocale', 'Musique generative', 'Edition prompts'] },
    { key: 'build', label: 'BUILD', color: 'var(--green)', desc: 'Outils developpeurs : multi-modeles, generation de code, debug intelligent.', items: ['Chat multi-LLM', 'Code generation', 'Debug assistant', 'API REST', 'Docs interactives'] },
    { key: 'complete', label: 'COMPLET', color: 'var(--gold)', desc: 'Acces total a tous les univers, sans limite. Pour les utilisateurs avances.', items: ['Tous les outils', 'Quotas premium', 'Marketplace', 'Acces API', 'Support prioritaire'] },
  ]

  return (
    <section id="tools" className="relative z-10 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            <Layers className="h-3 w-3 text-[var(--purple)]" />
            Univers
          </div>
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3rem] lg:text-[3.5rem]">
            Quatre univers.
            <br />
            <span className="bg-gradient-to-br from-white via-[var(--pink)] to-[var(--purple)] bg-clip-text text-transparent">
              Une seule plateforme.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/60">
            Choisis l&apos;univers qui correspond a ton usage, ou prends-les tous.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
          {universes.map((u, i) => (
            <Reveal key={u.key} delay={i * 0.08}>
              <div
                className="group relative h-full overflow-hidden rounded-3xl border bg-white/[0.02] p-8 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1"
                style={{ borderColor: `${u.color}22` }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: `radial-gradient(800px circle at 0% 0%, ${u.color}14, transparent 40%)` }}
                />
                <div className="relative flex items-center gap-3">
                  <span className="font-display text-[12px] font-bold tracking-[0.22em]" style={{ color: u.color }}>{u.label}</span>
                  <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${u.color}66, transparent)` }} />
                </div>
                <p className="relative mt-5 text-[15px] leading-relaxed text-white/60">{u.desc}</p>
                <ul className="relative mt-6 space-y-3">
                  {u.items.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-[14px] text-white/85">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: `${u.color}22`, color: u.color, border: `1px solid ${u.color}44` }}
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Pricing ─────────────────────────────────────────────────────────── */
function Pricing() {
  const plans = [
    { name: 'Free', price: '0', period: 'pour toujours', desc: 'Pour decouvrir AKASHA', features: ['10 requetes par jour', 'Chat AKASHA Sonnet', 'Acces a la communaute', 'Mises a jour gratuites'], cta: 'Commencer', highlight: false },
    { name: 'Specialise', price: '7', period: '/ mois', desc: 'AUTOMATE, CREATE ou BUILD', features: ['100 requetes par jour', 'Acces a un univers complet', 'Agents et workflows', 'Support standard'], cta: 'Choisir un univers', highlight: false },
    { name: 'Complet', price: '22', period: '/ mois', desc: 'Tous les univers, tous les outils', features: ['300 requetes par jour', 'Tous les univers AKASHA', 'Marketplace inclus', 'API REST', 'Support prioritaire'], cta: 'Tout debloquer', highlight: true },
  ]

  return (
    <section id="pricing" className="relative z-10 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            <Zap className="h-3 w-3 text-[var(--gold)]" />
            Tarification
          </div>
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3rem] lg:text-[3.5rem]">
            Simple.
            <br />
            <span className="bg-gradient-to-br from-white via-[var(--gold)] to-[var(--orange)] bg-clip-text text-transparent">
              Sans surprise.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/60">
            Pas de frais caches. Pas d&apos;engagement. Annule a tout moment.
          </p>
        </Reveal>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div
                className={`relative h-full overflow-hidden rounded-3xl border p-8 backdrop-blur-xl transition-all duration-500 ${
                  p.highlight
                    ? 'border-[var(--cyan)]/40 bg-gradient-to-br from-[var(--cyan)]/[0.08] to-[var(--purple)]/[0.08] shadow-[0_30px_80px_-20px_rgba(0,212,255,0.25)]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                }`}
              >
                {p.highlight && (
                  <>
                    <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-[var(--cyan)]/20 to-[var(--purple)]/20 opacity-50 blur-xl" />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_-4px_rgba(0,212,255,0.6)]">
                      Le plus populaire
                    </div>
                  </>
                )}
                <div className="relative">
                  <h3 className="font-display text-[20px] font-semibold tracking-tight text-white">{p.name}</h3>
                  <p className="mt-1 text-[13px] text-white/55">{p.desc}</p>

                  <div className="mt-8 flex items-baseline gap-1">
                    <span className="font-display text-[56px] font-bold tracking-[-0.04em] text-white">
                      {p.price === '0' ? '0' : `${p.price}€`}
                    </span>
                    <span className="text-[13px] text-white/50">{p.period}</span>
                  </div>

                  <Link
                    href="/signup"
                    className={`mt-7 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-[14px] font-semibold transition-all ${
                      p.highlight
                        ? 'bg-white text-[#0A0A0F] shadow-[0_8px_30px_-8px_rgba(255,255,255,0.4)] hover:scale-[1.02]'
                        : 'border border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                  >
                    {p.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <div className="my-7 h-px bg-white/[0.06]" />

                  <ul className="space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/75">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--cyan)]" strokeWidth={2.5} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-12 text-center">
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--cyan)] hover:underline">
            Voir tous les plans et options <ArrowRight className="h-3 w-3" />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}

/* ─── Trust strip ─────────────────────────────────────────────────────── */
function Trust() {
  const items = [
    { icon: Shield, label: 'RGPD', desc: 'Hebergement Europe' },
    { icon: Cpu, label: 'Multi-modeles', desc: 'Sonnet, Opus, Haiku' },
    { icon: Globe, label: '16 langues', desc: 'Interface i18n' },
    { icon: Zap, label: 'Sans engagement', desc: 'Annulation 1 clic' },
  ]
  return (
    <section className="relative z-10 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {items.map((it) => (
            <div
              key={it.label}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl transition-colors hover:border-white/10"
            >
              <it.icon className="h-5 w-5 text-[var(--cyan)]" />
              <div className="mt-4 font-display text-[14px] font-semibold text-white">{it.label}</div>
              <div className="mt-1 text-[12px] text-white/50">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────────────── */
function FAQ() {
  const faqs = [
    { q: 'Qu\'est-ce qu\'AKASHA AI ?', a: 'AKASHA AI est une plateforme tout-en-un qui regroupe chat multi-modeles, generation d\'images et de videos, agents autonomes et automatisations dans une seule interface. Un compte, un prix, tous les outils.' },
    { q: 'Combien coute AKASHA ?', a: 'Le plan gratuit te donne 10 requetes par jour, sans carte bancaire. Les plans specialises (AUTOMATE, CREATE ou BUILD) commencent a 7€/mois. Le plan Complet, qui debloque tous les univers, commence a 22€/mois.' },
    { q: 'Puis-je annuler quand je veux ?', a: 'Oui. La resiliation se fait en un clic depuis tes parametres. Aucun engagement, aucuns frais caches. Tu gardes l\'acces jusqu\'a la fin de la periode payee.' },
    { q: 'Mes donnees sont-elles securisees ?', a: 'Oui. AKASHA est conforme RGPD, heberge en Europe, et tes donnees sont chiffrees en transit et au repos. Tu peux exporter ou supprimer ton compte a tout moment.' },
    { q: 'Y a-t-il une API pour les developpeurs ?', a: 'Oui, une API REST est disponible avec le plan Complet. Documentation et exemples disponibles dans la section developpeurs.' },
    { q: 'AKASHA est-il disponible en plusieurs langues ?', a: 'L\'interface est disponible en 16 langues. Les modeles IA repondent dans la langue de ton choix.' },
  ]

  return (
    <section id="faq" className="relative z-10 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3rem]">
            Questions <span className="bg-gradient-to-br from-white to-[var(--cyan-soft)] bg-clip-text text-transparent">frequentes</span>
          </h2>
        </Reveal>

        <div className="mt-14 space-y-3">
          {faqs.map((item, i) => (
            <Reveal key={i} delay={i * 0.04}>
              <details className="group overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl transition-colors open:border-white/10 open:bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-medium text-white">
                  <span>{item.q}</span>
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)] transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="border-t border-white/[0.06] px-6 py-5 text-[14px] leading-relaxed text-white/65">
                  {item.a}
                </div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA Final ───────────────────────────────────────────────────────── */
function CTAFinal() {
  return (
    <section className="relative z-10 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0f1219] via-[#0c0e16] to-[#0a0c12] p-10 text-center sm:p-16 lg:p-20">
            {/* Glow */}
            <div className="absolute -inset-x-20 -top-40 h-80 bg-gradient-to-r from-[var(--cyan)]/25 via-[var(--purple)]/25 to-[var(--pink)]/25 blur-3xl" />
            {/* Grid */}
            <div
              className="absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(ellipse 80% 50% at 50% 0%, #000, transparent)',
              }}
            />
            <div className="relative">
              <h2 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3rem] lg:text-[3.75rem]">
                Pret a tout
                <br />
                <span className="bg-gradient-to-br from-white via-[var(--cyan-soft)] to-[var(--purple)] bg-clip-text text-transparent">simplifier ?</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/60 sm:text-lg">
                Cree ton compte en 30 secondes. Sans carte bancaire.
              </p>
              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/signup"
                  data-testid="footer-cta-signup"
                  className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-8 text-[15px] font-semibold text-[#0A0A0F] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.5)] transition-all hover:scale-[1.02] sm:w-auto"
                >
                  Commencer gratuitement
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/pricing"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-8 text-[15px] font-semibold text-white backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.06] sm:w-auto"
                >
                  Voir les tarifs
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────── */
function Footer() {
  const cols = [
    { title: 'Produit', links: [{ label: 'Fonctionnalites', href: '#features' }, { label: 'Tarifs', href: '/pricing' }, { label: 'API', href: '/dashboard/api' }, { label: 'Changelog', href: '/changelog' }] },
    { title: 'Ressources', links: [{ label: 'Centre d\'aide', href: '/aide' }, { label: 'Status', href: '/status' }, { label: 'Contact', href: '/contact' }, { label: 'Ecosysteme', href: '/ecosystem' }] },
    { title: 'Legal', links: [{ label: 'Mentions legales', href: '/mentions-legales' }, { label: 'CGU', href: '/cgu' }, { label: 'CGV', href: '/cgv' }, { label: 'Confidentialite', href: '/politique-confidentialite' }, { label: 'Cookies', href: '/cookies' }] },
  ]

  return (
    <footer className="relative z-10 border-t border-white/[0.06] px-6 pb-12 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 lg:gap-16">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] shadow-[0_6px_20px_-4px_rgba(0,212,255,0.5)]">
                <span className="font-display text-sm font-bold text-white">A</span>
              </div>
              <span className="font-display text-base font-semibold tracking-tight text-white">AKASHA</span>
            </Link>
            <p className="mt-5 max-w-xs text-[12px] leading-relaxed text-[var(--text-muted)]">
              L&apos;ecosysteme IA tout-en-un. Concu et heberge en Europe.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/85">{col.title}</div>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[13px] text-white/55 transition-colors hover:text-white">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center gap-3 border-t border-white/[0.06] pt-8 sm:flex-row sm:justify-between">
          <p className="text-[11px] text-[var(--text-muted)]">&copy; 2026 AKASHA AI &middot; SASU PURAMA &middot; Frasne, France</p>
          <p className="text-[11px] text-[var(--text-muted)]">TVA non applicable, art. 293 B du CGI</p>
        </div>
      </div>
    </footer>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="relative overflow-hidden">
        <Hero />
        <Features />
        <Tools />
        <Pricing />
        <Trust />
        <FAQ />
        <CTAFinal />
      </main>
      <Footer />
    </>
  )
}
