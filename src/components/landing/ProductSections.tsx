'use client'

import Link from 'next/link'
import { Check, MessageSquare, Image as ImageIcon, Bot, Workflow, Code2, Mic,
  Shield, Sparkles, Zap, Layers, Globe, Cpu, ArrowRight } from 'lucide-react'
import Reveal from './Reveal'

export function Features() {
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
export function Tools() {
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
export function Pricing() {
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
