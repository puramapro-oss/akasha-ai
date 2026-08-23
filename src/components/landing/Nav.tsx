'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'

export default function Nav() {
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
