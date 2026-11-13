import { describe, expect, it, vi } from 'vitest'
import { buildSymbolicIAOContext, isAdultForSymbolicIAO, localCalendarDate } from './symbolic-cycles'

describe('éligibilité adulte indépendante des dates de simulation', () => {
  it('utilise la date locale, pas une extraction UTC forcée', () => {
    expect(localCalendarDate(new Date(2026, 10, 13, 0, 15))).toBe('2026-11-13')
    expect(localCalendarDate(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13')
  })

  it('applique la majorité au véritable anniversaire, pas la veille', () => {
    expect(isAdultForSymbolicIAO('2008-11-13', '2026-11-12')).toBe(false)
    expect(isAdultForSymbolicIAO('2008-11-13', '2026-11-13')).toBe(true)
    expect(isAdultForSymbolicIAO('2008-11-13', '2026-11-14')).toBe(true)
    expect(isAdultForSymbolicIAO('2012-01-01', '2026-11-13')).toBe(false)
  })

  it('ne permet pas de devenir artificiellement majeur en choisissant une date future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T12:00:00.000Z'))
    try {
      const artificialFuture = {
        consent: true as const,
        birthDate: '2012-01-01',
        asOfDate: '2040-01-01',
      }
      expect(() => buildSymbolicIAOContext(artificialFuture)).toThrow('réservé aux adultes')
      expect(buildSymbolicIAOContext({
        consent: true,
        birthDate: '2002-05-10',
        asOfDate: '2040-01-01',
      })).toContain('consentement explicite')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne transmet toujours rien sans consentement', () => {
    expect(buildSymbolicIAOContext()).toBe('')
    expect(buildSymbolicIAOContext({ consent: false, birthDate: '2002-05-10', asOfDate: '2026-11-13' } as never)).toBe('')
  })
})
