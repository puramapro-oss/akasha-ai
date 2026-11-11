'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@/types'

const THEME_EVENT = 'akasha-theme-change'
let transientTheme: Theme | null = null
const validTheme = (value: string | null): value is Theme => value === 'dark' || value === 'light' || value === 'oled'
function readTheme(): Theme {
  if (transientTheme) return transientTheme
  try {
    const current = localStorage.getItem('akasha-theme')
    if (validTheme(current)) return current
    const legacy = localStorage.getItem('akasha_theme')
    if (validTheme(legacy)) return legacy
  } catch { /* An unavailable preference store keeps the usable default. */ }
  return 'dark'
}
function subscribeTheme(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === 'akasha-theme' || event.key === 'akasha_theme') {
      transientTheme = null
      notify()
    }
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(THEME_EVENT, notify)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(THEME_EVENT, notify)
  }
}
const serverTheme = (): Theme => 'dark'

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const setTheme = useCallback((next: Theme) => {
    transientTheme = next
    try { localStorage.setItem('akasha-theme', next); transientTheme = null } catch { /* Keep the explicit choice usable in this tab. */ }
    document.documentElement.dataset.theme = next
    window.dispatchEvent(new Event(THEME_EVENT))
  }, [])
  return { theme, setTheme }
}
