import { XP_TITLES } from '@/lib/constants'

export function getXPTitle(level: number): string {
  const found = XP_TITLES.find((t) => level >= t.min && level <= t.max)
  return found?.title ?? 'Explorateur'
}

export function getXPForNextLevel(level: number): number {
  return (level + 1) * 500
}
