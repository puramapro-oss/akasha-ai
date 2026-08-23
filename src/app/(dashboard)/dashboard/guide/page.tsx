'use client'

import { useState } from 'react'
import { MessageSquare, Image, Bot, Zap, Users, Plug, ChevronRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const GUIDES = [
  {
    id: 'chat',
    icon: MessageSquare,
    title: 'Chat IA',
    color: '#00d4ff',
    steps: [
      'Ouvre le Chat IA depuis le menu',
      'Choisis ton modele (Sonnet, Opus ou Haiku)',
      'Ecris ta question ou colle du texte a analyser',
      'Utilise la reconnaissance vocale pour dicter',
      'Sauvegarde tes conversations favorites',
    ],
  },
  {
    id: 'studio',
    icon: Image,
    title: 'Studio Creatif',
    color: '#a855f7',
    steps: [
      'Va dans Studio Creatif',
      'Choisis le type : Image, Video, Audio ou Code',
      'Decris precisement ce que tu veux generer',
      'Ajuste les parametres (taille, style, modele)',
      'Telecharge ou partage ta creation',
    ],
  },
  {
    id: 'agents',
    icon: Bot,
    title: 'Agents IA',
    color: '#f59e0b',
    steps: [
      'Cree un agent avec un role specifique',
      'Definis son prompt systeme et sa personnalite',
      'Teste-le dans le chat',
      'Publie-le sur le Marketplace pour le partager',
      'Installe les agents de la communaute',
    ],
  },
  {
    id: 'automation',
    icon: Zap,
    title: 'Automatisation',
    color: '#10b981',
    steps: [
      'Cree un workflow avec des etapes',
      'Configure un declencheur (horaire, evenement)',
      'Connecte des actions : IA, email, webhook',
      'Active le workflow et suis les executions',
      'Optimise avec les analytics',
    ],
  },
  {
    id: 'collab',
    icon: Users,
    title: 'Collaboration',
    color: '#ec4899',
    steps: [
      'Cree un espace de collaboration',
      'Invite des membres par email',
      'Partagez un chat IA commun',
      'Travaillez ensemble en temps reel',
      'Gerez les roles (admin, editeur, lecteur)',
    ],
  },
  {
    id: 'api',
    icon: Plug,
    title: 'API Console',
    color: '#6366f1',
    steps: [
      'Genere une cle API dans la console',
      'Utilise l endpoint /api/v1/chat pour les requetes',
      'Authentifie avec le header Authorization',
      'Suis ta consommation dans les analytics',
      'Consulte la documentation pour les parametres',
    ],
  },
]

export default function GuidePage() {
  const [activeGuide, setActiveGuide] = useState(GUIDES[0].id)

  const guide = GUIDES.find(g => g.id === activeGuide)!

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Guide</h1>
        <p className="mt-1 text-[var(--text-secondary)]">Apprends a utiliser toutes les fonctionnalites d AKASHA</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar */}
        <div className="space-y-1">
          {GUIDES.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGuide(g.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all',
                activeGuide === g.id
                  ? 'bg-white/10 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/5'
              )}
            >
              <g.icon className="h-5 w-5" style={{ color: g.color }} />
              {g.title}
              {activeGuide === g.id && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <Card className="lg:col-span-3 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${guide.color}15` }}>
              <guide.icon className="h-6 w-6" style={{ color: guide.color }} />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{guide.title}</h2>
          </div>
          <ol className="space-y-4">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: `${guide.color}15`, color: guide.color }}>
                  {i + 1}
                </div>
                <p className="pt-1 text-[var(--text-primary)]">{step}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
