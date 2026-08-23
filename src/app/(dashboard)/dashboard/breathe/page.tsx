'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'

type Phase = 'inspire' | 'hold' | 'expire'

const PHASES: { name: Phase; duration: number; label: string }[] = [
  { name: 'inspire', duration: 4, label: 'Inspire' },
  { name: 'hold', duration: 7, label: 'Retiens' },
  { name: 'expire', duration: 8, label: 'Expire' },
]

const TARGET_DURATION = 180 // 3 minutes = +50pts

export default function BreathePage() {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('inspire')
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [phaseElapsed, setPhaseElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const currentPhase = PHASES[phaseIndex]
  const progress = Math.min(elapsed / TARGET_DURATION, 1)

  const tick = useCallback(() => {
    setElapsed(prev => prev + 1)
    setPhaseElapsed(prev => {
      const next = prev + 1
      if (next >= PHASES[phaseIndex].duration) {
        // Move to next phase
        setPhaseIndex(pi => {
          const nextPi = (pi + 1) % PHASES.length
          if (nextPi === 0) setCycles(c => c + 1)
          setPhase(PHASES[nextPi].name)
          return nextPi
        })
        return 0
      }
      return next
    })
  }, [phaseIndex])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, tick])

  const reset = () => {
    setRunning(false)
    setPhase('inspire')
    setPhaseIndex(0)
    setElapsed(0)
    setPhaseElapsed(0)
    setCycles(0)
  }

  const circleScale = phase === 'inspire' ? 1.3 : phase === 'hold' ? 1.3 : 0.8

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8">
      {/* Back */}
      <div className="w-full max-w-md mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Respiration 4-7-8</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-10 text-center max-w-xs">
        Inspire 4s, retiens 7s, expire 8s. 3 minutes pour retrouver le calme.
      </p>

      {/* Breathing circle */}
      <div className="relative w-64 h-64 flex items-center justify-center mb-8">
        {/* Background ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="50" cy="50" r="46"
            fill="none"
            stroke="var(--cyan)"
            strokeWidth="2"
            strokeDasharray={`${progress * 289} 289`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>

        {/* Animated breathing orb */}
        <motion.div
          animate={{ scale: running ? circleScale : 1 }}
          transition={{
            duration: currentPhase.duration,
            ease: phase === 'hold' ? 'linear' : 'easeInOut',
          }}
          className="w-40 h-40 rounded-full bg-gradient-to-br from-[var(--cyan)]/20 to-[var(--purple)]/20 border border-[var(--cyan)]/30 flex items-center justify-center backdrop-blur-xl"
        >
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--cyan)]">
              {running ? currentPhase.label : 'Pret ?'}
            </p>
            <p className="text-3xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {running ? (currentPhase.duration - phaseElapsed) : '4-7-8'}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 mb-8 text-sm text-[var(--text-secondary)]">
        <span>{formatTime(elapsed)}</span>
        <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
        <span>{cycles} cycle{cycles !== 1 ? 's' : ''}</span>
        {elapsed >= TARGET_DURATION && (
          <>
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 font-medium">+50 pts</span>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={reset}
          disabled={elapsed === 0}
          data-testid="btn-breathe-reset"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => setRunning(!running)}
          className="px-8"
          data-testid="btn-breathe-toggle"
        >
          {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          <span className="ml-2">{running ? 'Pause' : 'Commencer'}</span>
        </Button>
      </div>

      {/* Message */}
      <p className="text-xs text-[var(--text-muted)] mt-8 text-center max-w-xs">
        La respiration 4-7-8 active le systeme parasympathique et reduit le stress en quelques cycles.
      </p>
    </div>
  )
}
