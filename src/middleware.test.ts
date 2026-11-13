import { describe, expect, it } from 'vitest'
import { isPublicPath } from './middleware'

describe('frontière publique du parcours cycles', () => {
  it('laisse découvrir le parcours sans ouvrir le tableau privé', () => {
    expect(isPublicPath('/cycles')).toBe(true)
    for (const route of ['/dashboard/cycles', '/dashboard/chat', '/cycles-personnel', '/cycles/profil', '/settings']) {
      expect(isPublicPath(route)).toBe(false)
    }
  })

  it('préserve les routes publiques déjà prévues', () => {
    for (const route of ['/', '/signup', '/login', '/how-it-works', '/go/test', '/share/test', '/api/chat']) {
      expect(isPublicPath(route)).toBe(true)
    }
  })
})
