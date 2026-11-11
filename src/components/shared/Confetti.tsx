'use client'

import { useEffect, useState } from 'react'

interface ConfettiProps { active: boolean; duration?: number }
const COLORS = ['#00d4ff', '#a855f7', '#f59e0b', '#10b981', '#ec4899', '#6366f1']
// A fixed, varied pattern renders identically on the server and client.
const PARTICLES = Array.from({ length: 50 }, (_, id) => ({
  id, x: (id * 37 + 11) % 100, color: COLORS[(id * 7) % COLORS.length],
  delay: (id * 97) % 500, size: 4 + ((id * 13) % 9),
  radius: id % 2 ? '50%' : '2px', duration: 1500 + ((id * 113) % 1500),
}))

export default function Confetti({ active, duration = 3000 }: ConfettiProps) {
  return active ? <ConfettiBurst key={duration} duration={duration} /> : null
}

function ConfettiBurst({ duration }: { duration: number }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(timer)
  }, [duration])
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden="true">
      {PARTICLES.map(p => (
        <div key={p.id} className="absolute animate-confetti" style={{
          left: `${p.x}%`, top: '-10px', width: `${p.size}px`, height: `${p.size}px`,
          backgroundColor: p.color, borderRadius: p.radius,
          animationDelay: `${p.delay}ms`, animationDuration: `${p.duration}ms`,
        }} />
      ))}
    </div>
  )
}
