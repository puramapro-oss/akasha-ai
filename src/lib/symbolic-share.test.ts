import { describe, expect, it } from 'vitest'
import {
  CYCLES_SHARE_URL,
  PUBLIC_CYCLES_URL,
  getCyclesSharePayload,
  shareLocaleFromBrowser,
} from './symbolic-share'

describe('partage éducatif des cycles', () => {
  it('pointe uniquement sur une page publique de découverte et un suivi de campagne générique', () => {
    const parsed = new URL(CYCLES_SHARE_URL)
    expect(parsed.origin + parsed.pathname).toBe(PUBLIC_CYCLES_URL)
    expect(parsed.pathname).toBe('/cycles')
    expect([...parsed.searchParams.keys()].sort()).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
    expect(CYCLES_SHARE_URL).not.toContain('/dashboard/')
    expect(CYCLES_SHARE_URL).not.toContain('/login')
  })

  it.each(['fr', 'en'] as const)('n’inclut aucune information personnelle dans le partage %s', (locale) => {
    const payload = getCyclesSharePayload(locale)
    const rendered = JSON.stringify(payload)
    expect(payload.url).toBe(CYCLES_SHARE_URL)
    expect(payload.title.length).toBeGreaterThan(10)
    expect(payload.text.length).toBeGreaterThan(90)
    for (const sensitive of ['birthDate', '2002-05-10', 'dateNaissance', 'age=', 'ascendantSign', 'user_id', 'referral_code']) {
      expect(rendered).not.toContain(sensitive)
    }
  })

  it('ne forge aucune récompense ni preuve de publication', () => {
    const text = getCyclesSharePayload('fr').text.toLowerCase()
    expect(text).not.toContain('points')
    expect(text).not.toContain('gagne')
    expect(text).not.toContain('garanti')
  })

  it('choisit une traduction disponible sans exposer le navigateur', () => {
    expect(shareLocaleFromBrowser('fr-FR')).toBe('fr')
    expect(shareLocaleFromBrowser('fr-CA')).toBe('fr')
    expect(shareLocaleFromBrowser('en-US')).toBe('en')
    expect(shareLocaleFromBrowser('de-DE')).toBe('en')
    expect(shareLocaleFromBrowser()).toBe('en')
  })
})
