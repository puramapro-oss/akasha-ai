import { describe, expect, it } from 'vitest'
import { buildSymbolicIAOContext, calculateSymbolicCycles } from './symbolic-cycles'

describe('cycles symboliques', () => {
  it('commence à la maison I et au Capricorne à 0 an', () => {
    const r = calculateSymbolicCycles({ birthDate: '2000-03-01', asOfDate: '2000-03-01', ascendantSign: 0 })
    expect(r.age).toBe(0)
    expect(r.annualProfection).toEqual({ house: 1, sign: 'Bélier', traditionalRuler: 'Mars', requiresAscendant: false })
    expect(r.cosmicClock).toMatchObject({ line: 0, label: '12 h', sign: 'Capricorne', revolution: 1 })
  })

  it.each([
    [1, 2, 'Verseau', 1],
    [12, 1, 'Capricorne', 2],
    [24, 1, 'Capricorne', 3],
    [25, 2, 'Verseau', 3],
    [35, 12, 'Sagittaire', 3],
  ])('à %i ans : maison %i, horloge %s, tour %i', (age, house, sign, revolution) => {
    const r = calculateSymbolicCycles({ birthDate: '2000-03-01', asOfDate: `${2000 + age}-03-01`, ascendantSign: 0 })
    expect(r.annualProfection.house).toBe(house)
    expect(r.cosmicClock.sign).toBe(sign)
    expect(r.cosmicClock.revolution).toBe(revolution)
  })

  it('utilise les maîtres traditionnels (Saturne pour Verseau, Jupiter pour Poissons, Mars pour Scorpion)', () => {
    expect(calculateSymbolicCycles({ birthDate: '2000-01-01', asOfDate: '2000-01-01', ascendantSign: 10 }).annualProfection.traditionalRuler).toBe('Saturne')
    expect(calculateSymbolicCycles({ birthDate: '2000-01-01', asOfDate: '2000-01-01', ascendantSign: 11 }).annualProfection.traditionalRuler).toBe('Jupiter')
    expect(calculateSymbolicCycles({ birthDate: '2000-01-01', asOfDate: '2000-01-01', ascendantSign: 7 }).annualProfection.traditionalRuler).toBe('Mars')
  })

  it('ne devine jamais un ascendant inconnu', () => {
    const r = calculateSymbolicCycles({ birthDate: '1990-01-01', asOfDate: '2026-01-01' })
    expect(r.annualProfection).toEqual({ house: 1, sign: null, traditionalRuler: null, requiresAscendant: true })
  })

  it('respecte le jour anniversaire, y compris le 29 février', () => {
    expect(calculateSymbolicCycles({ birthDate: '2000-02-29', asOfDate: '2025-02-28' }).age).toBe(24)
    expect(calculateSymbolicCycles({ birthDate: '2000-02-29', asOfDate: '2025-03-01' }).age).toBe(25)
    expect(calculateSymbolicCycles({ birthDate: '2000-02-29', asOfDate: '2024-02-29' }).age).toBe(24)
  })

  it.each(['2026-02-30', '2026-13-01', '2026/01/01', 'abcd-01-01'])('rejette une date invalide : %s', (birthDate) => {
    expect(() => calculateSymbolicCycles({ birthDate, asOfDate: '2026-11-13' })).toThrow()
  })

  it('rejette date future, âge hors limite et ascendant non numérique', () => {
    expect(() => calculateSymbolicCycles({ birthDate: '2027-01-01', asOfDate: '2026-11-13' })).toThrow()
    expect(() => calculateSymbolicCycles({ birthDate: '1900-01-01', asOfDate: '2090-01-01' })).toThrow()
    expect(() => calculateSymbolicCycles({ birthDate: '2000-01-01', asOfDate: '2026-01-01', ascendantSign: 12 })).toThrow()
    expect(() => calculateSymbolicCycles({ birthDate: '2000-01-01', asOfDate: '2026-01-01', ascendantSign: 1.5 })).toThrow()
  })

  it('n’insère rien dans le contexte IA sans accord explicite', () => {
    expect(buildSymbolicIAOContext()).toBe('')
    expect(buildSymbolicIAOContext({ consent: false, birthDate: '2000-01-01', asOfDate: '2026-01-01' } as never)).toBe('')
  })

  it('ne transmet pas la date de naissance brute et indique les limites', () => {
    const ctx = buildSymbolicIAOContext({ consent: true, birthDate: '2000-11-18', asOfDate: '2026-11-13' })
    expect(ctx).toContain('Ascendant absent')
    expect(ctx).toContain('tradition')
    expect(ctx).not.toContain('2000-11-18')
    expect(ctx).toContain('Ne présente AUCUNE')
  })
})
