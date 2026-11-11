'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '@/types'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('akasha_theme') as Theme | null
    if (stored && ['dark', 'light', 'oled'].includes(stored)) {
      setThemeState(stored)
      document.documentElement.setAttribute('data-theme', stored)
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem('akasha_theme', t) } catch { /* stockage refusé (navigation privée, quota 0, verrouillage iOS) : ne jamais bloquer l'UI */ }
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  return { theme, setTheme }
}
