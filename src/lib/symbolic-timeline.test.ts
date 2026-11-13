import { describe, expect, it } from 'vitest'
import { buildSymbolicIAOContext, calculateSymbolicCycles, getSymbolicCycleTimeline } from './symbolic-cycles'

describe('chronologie des cycles symboliques', () => {
  const input = { birthDate: '2002-05-10', asOfDate: '2026-11-13', ascendantSign: 1 }

  it('construit 12 positions annuelles cohérentes à partir du résultat du calculateur', () => {
    const now = calculateSymbolicCycles(input)
    const timeline = getSymbolicCycleTimeline(input)
    expect(timeline).toHaveLength(12)
    expect(timeline[0]).toEqual({
      age: now.age,
      annualProfection: now.annualProfection,
      cosmicClock: now.cosmicClock,
    })
    expect(timeline.map((entry) => entry.annualProfection.house)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(timeline[0].cosmicClock.sign).toBe('Capricorne')
    expect(timeline[1].cosmicClock.sign).toBe('Verseau')
    expect(timeline[11].cosmicClock.sign).toBe('Sagittaire')
    expect(timeline[1].annualProfection.sign).toBe('Gémeaux')
  })

  it('conserve les deux traditions distinctes et respecte la progression cyclique', () => {
    for (let asc = 0; asc < 12; asc++) {
      for (let age = 0; age <= 130; age++) {
        const snapshot = calculateSymbolicCycles({
          birthDate: '1900-06-15',
          asOfDate: `${1900 + age}-06-15`,
          ascendantSign: asc,
        })
        expect(snapshot.age).toBe(age)
        expect(snapshot.annualProfection.house).toBe(age % 12 + 1)
        expect(snapshot.cosmicClock.line).toBe(age % 12)
        expect(snapshot.cosmicClock.revolution).toBe(Math.floor(age / 12) + 1)
        expect(snapshot.annualProfection.requiresAscendant).toBe(false)
      }
    }
  })

  it('ne déduit pas le signe de profection si l’Ascendant est inconnu', () => {
    const preview = getSymbolicCycleTimeline({ birthDate: '1999-01-01', asOfDate: '2026-01-01' })
    expect(preview).toHaveLength(12)
    expect(preview.every((entry) => entry.annualProfection.sign === null)).toBe(true)
    expect(preview.every((entry) => entry.annualProfection.traditionalRuler === null)).toBe(true)
  })

  it('tronque une perspective après 130 ans et rejette les longueurs invalides', () => {
    const data = { birthDate: '1900-01-01', asOfDate: '2030-01-01' }
    expect(getSymbolicCycleTimeline(data)).toHaveLength(1)
    expect(getSymbolicCycleTimeline(input, 24)).toHaveLength(24)
    for (const years of [0, 25, -1, 1.5, Number.NaN]) {
      expect(() => getSymbolicCycleTimeline(input, years)).toThrow(RangeError)
    }
  })

  it('réserve le partage individualisé avec IAO aux adultes', () => {
    const minor = { consent: true as const, birthDate: '2012-01-01', asOfDate: '2026-11-13' }
    expect(calculateSymbolicCycles(minor).age).toBe(14)
    expect(() => buildSymbolicIAOContext(minor)).toThrow('réservé aux adultes')
    expect(getSymbolicCycleTimeline(minor)).toHaveLength(12)
    expect(buildSymbolicIAOContext({ consent: true, ...input })).toContain('consentement explicite')
  })
})
