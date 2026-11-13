import { APP_DOMAIN } from './constants'

/**
 * A publicly discoverable, privacy-safe share destination.
 * NEVER include birthdays, ages, beliefs, astrological results or user IDs
 * in the URL or the share copy. Tracking is limited to campaign labels.
 */
export const PUBLIC_CYCLES_URL = `https://${APP_DOMAIN}/cycles`

export const CYCLES_SHARE_URL =
  `${PUBLIC_CYCLES_URL}?utm_source=organic_share&utm_medium=social&utm_campaign=cycles_symboliques`

export type CyclesShareLocale = 'fr' | 'en'

export interface CyclesSharePayload {
  title: string
  text: string
  url: string
}

export function getCyclesSharePayload(locale: CyclesShareLocale = 'fr'): CyclesSharePayload {
  return locale === 'en'
    ? {
      title: 'Explore symbolic cycles with AKASHA',
      text: 'Discover two distinct traditions: annual profections and the Cosmic Clock. Compare their sources and meanings without predictions or personal data.',
      url: CYCLES_SHARE_URL,
    }
    : {
      title: 'Découvrir les cycles symboliques avec AKASHA',
      text: 'Découvre deux traditions distinctes : les profections annuelles et l’Horloge cosmique. Compare leurs sources, sans prédictions ni partage de données personnelles.',
      url: CYCLES_SHARE_URL,
    }
}

export function shareLocaleFromBrowser(language?: string): CyclesShareLocale {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
