'use client'

import Link from 'next/link'
import { Check, ChevronDown, Shield, Cpu, Globe, Zap, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import Reveal from './Reveal'

export function Trust() {
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
export function FAQ() {
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
export function CTAFinal() {
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
export function Footer() {
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
