import { describe, expect, it } from 'vitest'
import { getCyclesLandingCopy } from './cycles-landing-copy'

describe('page de découverte internationale des cycles', () => {
  it.each(['fr-FR', 'fr-CA'])('fournit un contenu français complet pour %s', (locale) => {
    const copy = getCyclesLandingCopy(locale)
    expect(copy.heroTitle).toContain('Deux traditions')
    expect(copy.methods).toHaveLength(2)
    expect(copy.features).toHaveLength(3)
    expect(copy.seoDescription).toBeTruthy()
    expect(copy.privacyDescription).toContain('date de naissance')
  })

  it.each(['en', 'en-US', 'es', 'de'])('fournit un repli anglais explicite pour %s', (locale) => {
    const copy = getCyclesLandingCopy(locale)
    expect(copy.heroTitle).toContain('Two traditions')
    expect(copy.methods).toHaveLength(2)
    expect(copy.privacyDescription).toContain('date of birth')
  })

  it('ne promet ni guérison ni prédiction garantie', () => {
    for (const locale of ['fr', 'en']) {
      const copy = getCyclesLandingCopy(locale)
      const all = [copy.heroDescription, copy.caution, ...copy.methods.map(m => m.content), ...copy.features.map(f => f.content)].join(' ').toLowerCase()
      expect(all).not.toContain('guérison garantie')
      expect(all).not.toContain('guaranteed wealth')
      expect(copy.methods[0].title).not.toBe(copy.methods[1].title)
    }
  })
})
