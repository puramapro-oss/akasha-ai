'use client'

import { Megaphone, Link2, Award, Wallet } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatNumber } from '@/lib/utils'
import { AMBASSADOR_TIERS } from '@/constants/ambassador'

interface AmbassadorRegistrationProps {
  registering: boolean
  onRegister: () => void
}

export default function AmbassadorRegistration({
  registering,
  onRegister,
}: AmbassadorRegistrationProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <Megaphone className="mx-auto h-16 w-16 text-[var(--cyan)]" />
        <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">
          Deviens Ambassadeur AKASHA
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[var(--text-secondary)]">
          Rejoins le programme en 1 clic. Primes cumulables jusqu&apos;à 200 000 € selon ton palier.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Link2, label: 'Lien unique', desc: 'Ton lien /go/[slug] personnalisé' },
          { icon: Award, label: '9 paliers', desc: 'De Bronze 200 € à Éternel 200 K €' },
          { icon: Wallet, label: 'Versement auto', desc: 'Prime créditée à chaque palier' },
        ].map(({ icon: Icon, label, desc }) => (
          <Card key={label} className="p-4 text-center">
            <Icon className="mx-auto mb-2 h-8 w-8 text-[var(--cyan)]" />
            <p className="font-medium text-[var(--text-primary)]">{label}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{desc}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Paliers &amp; primes</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AMBASSADOR_TIERS.map(({ label, min, prime, color }) => (
            <div
              key={label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center"
            >
              <p className="text-sm font-bold" style={{ color }}>{label}</p>
              <p className="text-xs text-[var(--text-muted)]">{min}+ filleuls</p>
              <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {formatNumber(prime)} €
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="text-center">
        <Button onClick={onRegister} disabled={registering} size="lg">
          {registering ? 'Inscription…' : 'Postuler comme Ambassadeur'}
        </Button>
      </div>
    </div>
  )
}
