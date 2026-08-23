'use client'

import { useState } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import { copyToClipboard } from '@/lib/utils'

interface AmbassadorLinksProps {
  goLink: string
  profileLink: string
}

export default function AmbassadorLinks({ goLink, profileLink }: AmbassadorLinksProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(label)
      toast.success(`${label} copié`)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const shareTemplates = [
    `Découvre AKASHA AI, l'agrégateur multi-IA le plus complet ! ${goLink}`,
    `J'utilise AKASHA AI pour mes projets et c'est incroyable. Teste-le : ${goLink}`,
    `Chat IA, génération d'images/vidéos/code, agents personnalisés... tout en un sur AKASHA AI ${goLink}`,
  ]

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Tes liens</h3>
        <div className="space-y-3">
          {[
            { label: 'Lien de parrainage', url: goLink },
            { label: 'Page publique', url: profileLink },
          ].map(({ label, url }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
                <code className="flex-1 truncate text-sm text-[var(--cyan)]">{url}</code>
              </div>
              <button
                onClick={() => handleCopy(url, label)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
                aria-label={`Copier ${label}`}
              >
                {copied === label ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Templates de partage
        </h3>
        <div className="space-y-2">
          {shareTemplates.map((text, i) => (
            <div key={i} className="flex items-start gap-2">
              <p className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-[var(--text-secondary)]">
                {text}
              </p>
              <button
                onClick={() => handleCopy(text, `Template ${i + 1}`)}
                className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-white/5 transition-colors"
                aria-label={`Copier template ${i + 1}`}
              >
                {copied === `Template ${i + 1}` ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
