'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function TabPill({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] ring-1 ring-[var(--cyan)]/40'
          : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copie !')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-white/20 hover:text-[var(--text-primary)]"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copie !' : 'Copier'}
    </button>
  )
}
