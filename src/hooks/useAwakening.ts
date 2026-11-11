'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const AWAKENING_LEVELS = [
  { min: 1, max: 4, name: 'Eveille', emoji: '🌱' },
  { min: 5, max: 9, name: 'Conscient', emoji: '🌿' },
  { min: 10, max: 19, name: 'Aligne', emoji: '✨' },
  { min: 20, max: 49, name: 'Illumine', emoji: '🔥' },
  { min: 50, max: 99, name: 'Transcendant', emoji: '💫' },
  { min: 100, max: Infinity, name: 'Unifie', emoji: '🕉️' },
] as const

export function getAwakeningLevel(level: number) {
  return AWAKENING_LEVELS.find(l => level >= l.min && level <= l.max) ?? AWAKENING_LEVELS[0]
}

const AFFIRMATION_CATEGORIES = [
  'amour', 'puissance', 'abondance', 'sante', 'sagesse', 'gratitude',
] as const

// AKASHA = multi-IA → accent on puissance + sagesse + abondance
const AKASHA_AFFIRMATIONS: Record<string, string[]> = {
  puissance: [
    'Je suis capable de creer tout ce que j\'imagine.',
    'Mon potentiel est illimite.',
    'Chaque defi est une opportunite de grandir.',
    'Je suis maitre de mes pensees et de mes actions.',
    'Ma determination transforme les obstacles en tremplins.',
  ],
  sagesse: [
    'La connaissance que je cherche est deja en moi.',
    'Chaque experience m\'enseigne quelque chose de precieux.',
    'Je fais confiance a mon intuition.',
    'Le savoir est la cle de ma liberte.',
    'Je grandis a chaque instant.',
  ],
  abondance: [
    'L\'univers m\'offre des opportunites infinies.',
    'Je merite le succes et la prosperite.',
    'L\'abondance coule naturellement vers moi.',
    'Je suis reconnaissant pour tout ce que j\'ai.',
    'Chaque jour m\'apporte de nouvelles richesses.',
  ],
  amour: [
    'Je suis digne d\'amour et de respect.',
    'Mon coeur est ouvert et genereux.',
    'Je repands la bienveillance autour de moi.',
    'L\'amour est ma force premiere.',
    'Je choisis la compassion dans chaque interaction.',
  ],
  sante: [
    'Mon corps est un temple que j\'honore chaque jour.',
    'Je prends soin de moi avec douceur.',
    'Mon energie vitale se renouvelle a chaque respiration.',
    'Je suis en harmonie avec mon corps et mon esprit.',
    'La sante est ma premiere richesse.',
  ],
  gratitude: [
    'Merci pour ce nouveau jour rempli de possibilites.',
    'Je suis reconnaissant pour les personnes dans ma vie.',
    'Chaque petit bonheur est un cadeau precieux.',
    'La gratitude transforme ma vision du monde.',
    'Je celebre chaque victoire, meme la plus petite.',
  ],
}

export function getRandomAffirmation(category?: string): { text: string; category: string } {
  const cat = category ?? AFFIRMATION_CATEGORIES[Math.floor(Math.random() * AFFIRMATION_CATEGORIES.length)]
  const affirmations = AKASHA_AFFIRMATIONS[cat] ?? AKASHA_AFFIRMATIONS.puissance
  const text = affirmations[Math.floor(Math.random() * affirmations.length)]
  return { text, category: cat }
}

const WISDOM_QUOTES = [
  { text: 'Connais-toi toi-meme.', author: 'Socrate' },
  { text: 'Le voyage de mille lieues commence par un seul pas.', author: 'Lao Tseu' },
  { text: 'Sois le changement que tu veux voir dans le monde.', author: 'Gandhi' },
  { text: 'L\'obstacle est le chemin.', author: 'Marc Aurele' },
  { text: 'Celui qui regarde a l\'exterieur reve. Celui qui regarde a l\'interieur s\'eveille.', author: 'Carl Jung' },
  { text: 'Il n\'y a pas de chemin vers le bonheur. Le bonheur est le chemin.', author: 'Bouddha' },
  { text: 'Etre libre, ce n\'est pas faire ce que l\'on veut, mais vouloir ce que l\'on fait.', author: 'Jean-Paul Sartre' },
  { text: 'Le silence est une source de grande force.', author: 'Lao Tseu' },
  { text: 'N\'essaie pas de devenir un homme de succes. Essaie de devenir un homme de valeur.', author: 'Albert Einstein' },
  { text: 'La vie n\'est pas d\'attendre que l\'orage passe, c\'est d\'apprendre a danser sous la pluie.', author: 'Seneque' },
  { text: 'Ce que tu cherches te cherche aussi.', author: 'Rumi' },
  { text: 'Quand tu changes ta facon de voir les choses, les choses que tu vois changent.', author: 'Wayne Dyer' },
]

export function getRandomQuote() {
  return WISDOM_QUOTES[Math.floor(Math.random() * WISDOM_QUOTES.length)]
}

export function useAwakening() {
  const { profile } = useAuth()
  const [awakeningLevel, setAwakeningLevel] = useState(1)
  const [affirmationSeen, setAffirmationSeen] = useState(false)

  useEffect(() => {
    setAwakeningLevel(profile?.level ?? 1)
    const seen = sessionStorage.getItem('akasha_affirmation_seen')
    if (seen === 'true') setAffirmationSeen(true)
  }, [profile])

  const markAffirmationSeen = useCallback(() => {
    try { sessionStorage.setItem('akasha_affirmation_seen', 'true') } catch { /* stockage refusé (navigation privée, quota 0, verrouillage iOS) : ne jamais bloquer l'UI */ }
    setAffirmationSeen(true)
  }, [])

  const level = getAwakeningLevel(awakeningLevel)

  return {
    awakeningLevel,
    levelInfo: level,
    affirmationSeen,
    markAffirmationSeen,
    getAffirmation: getRandomAffirmation,
    getQuote: getRandomQuote,
  }
}
