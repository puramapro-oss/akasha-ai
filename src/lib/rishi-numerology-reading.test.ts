import { describe, expect, it } from 'vitest'
import { describeRishiNumerologyReading, parseRishiNumerologyReading } from './rishi-numerology-reading'

const reading = {
  schema: 'purama.rishi.numerology.v1',
  pythagoreanLifePath: 11,
  chaldeanBirth: 9,
  loShuMissing: [2, 4, 9],
  tantricSoul: 22,
  kua: 3,
} as const

describe('import de numérologie RISHI', () => {
  it('préserve les cinq valeurs locales et décrit les cinq traditions', () => {
    const parsed = parseRishiNumerologyReading(reading)
    expect(parsed).toEqual(reading)
    expect(parsed.loShuMissing).not.toBe(reading.loShuMissing)
    expect(describeRishiNumerologyReading(parsed)).toBe('Chemin de vie pythagoricien 11 · nombre de naissance chaldéen 9 · chiffres absents de la grille Lo Shu (2, 4, 9) · nombre de l’âme tantrique 22 · Kua 3')
  })

  it.each([1, 9, 11, 22, 33, 44])('accepte le chemin de vie %s et le Kua facultatif', lifePath => {
    const parsed = parseRishiNumerologyReading({ ...reading, pythagoreanLifePath: lifePath, kua: null })
    expect(describeRishiNumerologyReading(parsed)).toContain('Kua non renseigné')
  })

  it.each([
    { schema: 'purama.rishi.numerology.v2' }, { date: '2000-01-01' }, { note: 'texte libre' },
    { pythagoreanLifePath: 10 }, { pythagoreanLifePath: 45 }, { chaldeanBirth: 0 },
    { chaldeanBirth: '1' }, { chaldeanBirth: 1.5 }, { tantricSoul: 33 }, { tantricSoul: 10 },
    { kua: 5 }, { kua: 0 }, { kua: '3' }, { loShuMissing: [9, 4] }, { loShuMissing: [2, 2] },
    { loShuMissing: [0] }, { loShuMissing: [10] }, { loShuMissing: [null] }, { loShuMissing: '24' },
    { loShuMissing: Array(10).fill(1) },
  ])('refuse tout champ hors contrat %#', override => {
    expect(() => parseRishiNumerologyReading({ ...reading, ...override })).toThrow(RangeError)
  })

  it('refuse un champ manquant, un objet hérité et un champ supplémentaire même spécial', () => {
    const { kua, ...incomplete } = reading
    expect(kua).toBe(3)
    const extra = JSON.parse(JSON.stringify(reading).replace(/}$/, ',"__proto__":"extra"}'))
    for (const value of [incomplete, Object.create(reading), extra, [], null, 'profil']) {
      expect(() => parseRishiNumerologyReading(value)).toThrow(RangeError)
    }
  })
})
