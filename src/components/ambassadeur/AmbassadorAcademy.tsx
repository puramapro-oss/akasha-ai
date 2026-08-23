'use client'

import { BookOpen } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { AmbassadorStats } from '@/types/ambassador'

interface AmbassadorAcademyProps {
  stats: AmbassadorStats
}

interface AcademyLevel {
  level: number
  title: string
  duration: string
  topics: string[]
  unlocked: boolean
}

export default function AmbassadorAcademy({ stats }: AmbassadorAcademyProps) {
  const levels: AcademyLevel[] = [
    {
      level: 1,
      title: 'Les bases',
      duration: '2h',
      topics: [
        'Créer ton lien',
        'Partager efficacement',
        'Comprendre les commissions',
        'Optimiser ton profil',
      ],
      unlocked: true,
    },
    {
      level: 2,
      title: 'Stratégie avancée',
      duration: '6h',
      topics: [
        'Audience cible',
        'Contenu qui convertit',
        'Réseaux sociaux',
        'Storytelling',
      ],
      unlocked: stats.signups >= 25,
    },
    {
      level: 3,
      title: 'Expert',
      duration: '12h',
      topics: ['Automatisation', 'Partenariats', 'Revenue passif', 'Scale'],
      unlocked: stats.signups >= 50,
    },
  ]

  return (
    <div className="space-y-4">
      {levels.map(({ level, title, duration, topics, unlocked }) => (
        <Card key={level} className={cn('p-5', !unlocked && 'opacity-60')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold',
                  unlocked
                    ? 'bg-[var(--cyan)]/20 text-[var(--cyan)]'
                    : 'bg-white/10 text-[var(--text-muted)]'
                )}
              >
                N{level}
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)]">{title}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {duration} — {topics.length} modules
                </p>
              </div>
            </div>
            <Badge variant={unlocked ? 'green' : 'default'}>
              {unlocked ? 'Disponible' : 'Verrouillé'}
            </Badge>
          </div>
          <ul className="mt-3 space-y-1">
            {topics.map((topic) => (
              <li
                key={topic}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
              >
                <BookOpen className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                {topic}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
