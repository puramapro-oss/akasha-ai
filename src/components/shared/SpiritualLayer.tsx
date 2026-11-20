'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useAwakening } from '@/hooks/useAwakening'
import Confetti from './Confetti'

/**
 * SpiritualLayer — affiche une affirmation modale 1x par session au login.
 * Se place dans le dashboard layout.
 */
export default function SpiritualLayer() {
  const { affirmationSeen, markAffirmationSeen, getAffirmation, levelInfo } = useAwakening()
  const [show, setShow] = useState(false)
  const [affirmation, setAffirmation] = useState<{ text: string; category: string } | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const integrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!affirmationSeen) {
      const timer = setTimeout(() => {
        setAffirmation(getAffirmation())
        setShow(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [affirmationSeen, getAffirmation])

  useEffect(() => () => {
    if (integrationTimer.current !== null) clearTimeout(integrationTimer.current)
    integrationTimer.current = null
  }, [affirmationSeen, getAffirmation])

  const handleIntegrate = () => {
    if (integrationTimer.current !== null) return
    setShowConfetti(true)
    integrationTimer.current = setTimeout(() => {
      integrationTimer.current = null
      setShow(false)
      markAffirmationSeen()
      setShowConfetti(false)
    }, 2000)
  }

  const handleDismiss = () => {
    if (integrationTimer.current !== null) clearTimeout(integrationTimer.current)
    integrationTimer.current = null
    setShowConfetti(false)
    setShow(false)
    markAffirmationSeen()
  }

  return (
    <>
      <Confetti active={showConfetti} />
      <AnimatePresence>
        {show && !affirmationSeen && affirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="relative max-w-md w-full bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_24px_64px_rgba(0,0,0,0.5)] text-center"
            >
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Level badge */}
              <div className="inline-flex items-center gap-2 bg-[var(--cyan)]/10 border border-[var(--cyan)]/20 rounded-full px-3 py-1 text-xs text-[var(--cyan)] mb-6">
                {levelInfo.emoji} {levelInfo.name}
              </div>

              {/* Affirmation */}
              <p className="text-2xl font-light text-white leading-relaxed mb-2">
                &ldquo;{affirmation.text}&rdquo;
              </p>
              <p className="text-xs text-white/40 mb-8 capitalize">{affirmation.category}</p>

              {/* CTA */}
              <button
                onClick={handleIntegrate}
                data-testid="btn-integrate-affirmation"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white font-medium px-6 py-3 rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(0,212,255,0.3)]"
              >
                <Sparkles className="w-4 h-4" />
                J&apos;integre
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
