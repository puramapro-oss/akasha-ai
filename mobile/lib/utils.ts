import * as Haptics from 'expo-haptics'
import { Platform, Dimensions } from 'react-native'

export function hapticLight() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
}

export function hapticMedium() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
}

export function hapticSuccess() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

// Évite de couper une paire de surrogates UTF-16 (emoji, caractères hors BMP) :
// si l'index de coupe tombe sur la seconde moitié d'une paire, recule d'une unité.
function safeCutIndex(str: string, index: number): number {
  if (index > 0 && index < str.length) {
    const code = str.charCodeAt(index)
    if (code >= 0xdc00 && code <= 0xdfff) return index - 1
  }
  return index
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, safeCutIndex(str, length)) + '...'
}

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
export const IS_SMALL_DEVICE = SCREEN_WIDTH < 375
