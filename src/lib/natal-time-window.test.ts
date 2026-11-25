import { describe, expect, it } from 'vitest'
import type { NatalInput } from './natal-chart'
import { calculateNatalTimeWindow, readNatalTimeWindow, selectionFromTimeWindow } from './natal-time-window'
import { TIME_MARGINS, type TimeMargin } from './natal-civil-time'

const utc: NatalInput = { date: '2000-01-01', time: '12:00', zone: 'UTC', latitude: 51.5, longitude: 0 }
function read(input: NatalInput, minutes: TimeMargin = 15) {
  const result = calculateNatalTimeWindow(input, minutes)
  if (result.status !== 'estimated') throw new Error('Lecture estimée attendue')
  return result
}

describe('sensibilité du thème à une heure de naissance estimée', () => {
  it.each(TIME_MARGINS)('couvre les deux bornes et chaque minute de la marge ±%i', m => {
    const result = read(utc, m)
    expect(result.samples).toBe(2 * m + 1)
    expect(result.positions).toHaveLength(10)
    expect(result.positions.every(p => p.signs.length && new Set(p.signs).size === p.signs.length)).toBe(true)
    expect(result.positions.some(p => 'longitude' in p || 'house' in p)).toBe(false)
    expect(result).not.toHaveProperty('cusps')
    expect(result).not.toHaveProperty('aspects')
  })
  it('garde les deux ascendants observés et ne choisit pas un ascendant de profection', () => {
    const result = read(utc, 30)
    expect(result.ascendantSigns).toEqual([0, 1])
    const selection = selectionFromTimeWindow(result)
    expect(selection.ascendantSign).toBeNull()
    expect(selection.options.find(o => o.id === 'angle:ascendant')?.label).toContain('Bélier ou Taureau')
    expect(selection.summary).toContain('Ascendant · Bélier ou Taureau')
  })
  it.each(['tropical', 'lahiri', 'fagan-bradley'] as const)('identifie la convention %s et la marge dans le partage', zodiac => {
    const selection = selectionFromTimeWindow(read({ ...utc, zodiac }))
    expect(selection.summary).toContain({ tropical: 'Tropical', lahiri: 'Lahiri', 'fagan-bradley': 'Fagan' }[zodiac])
    expect(selection.options).toHaveLength(13)
    expect(selection.options.every(o => o.label.includes('heure estimée') && o.question.includes('±15'))).toBe(true)
    expect(selection.options[0].basis).toEqual(selection.options.slice(1).map(o => o.label))
    expect(JSON.stringify(selection)).not.toMatch(/2000-01-01|12:00|UTC|51\.5|maison|opposition|conjonction/i)
  })
  it('exige un choix pendant une heure répétée et suit en temps réel chaque occurrence', () => {
    const fold = { ...utc, date: '2024-10-27', time: '02:30', zone: 'Europe/Paris' }
    expect(calculateNatalTimeWindow(fold, 60)).toEqual({ status: 'ambiguous',
      choices: ['2024-10-27T00:30:00.000Z', '2024-10-27T01:30:00.000Z'] })
    for (const [occurrence, time] of [['earlier', '00:30'], ['later', '01:30']] as const) {
      expect(read({ ...fold, occurrence }, 60)).toEqual(read({ ...fold, zone: 'UTC', time }, 60))
    }
    expect(read({ ...fold, occurrence: 'earlier' }, 5).ascendantSigns)
      .not.toEqual(read({ ...fold, occurrence: 'later' }, 5).ascendantSigns)
    expect(calculateNatalTimeWindow({ ...fold, date: '2024-03-31' }, 60)).toEqual({ status: 'gap', choices: [] })
  })
  it('préserve un milieu du ciel utilisable malgré un ascendant instable à un seul échantillon', () => {
    const polar = read({ ...utc, latitude: 66.5623, longitude: -10.4571 }, 5)
    expect(polar.ascendantSigns).toEqual([])
    expect(polar.midheavenSigns.length).toBeGreaterThan(0)
    expect(selectionFromTimeWindow(polar).options.map(o => o.id)).not.toContain('angle:ascendant')
    const missedGrazingRise = read({ ...utc, time: '12:00:30', latitude: 70, longitude: 22.44818 }, 5)
    expect(missedGrazingRise.ascendantSigns).toEqual([])
    expect(missedGrazingRise.midheavenSigns.length).toBeGreaterThan(0)
    const noLocation = read({ date: utc.date, time: utc.time, zone: utc.zone })
    expect(noLocation.ascendantSigns).toEqual([])
    expect(noLocation.midheavenSigns).toEqual([])
    expect(noLocation.positions).toHaveLength(10)
  })
  it('distingue heure inconnue, erreur de saisie et dépassement de la plage qualifiée', () => {
    expect(() => read({ ...utc, time: '' })).toThrow(/heure/i)
    expect(() => read({ ...utc, latitude: 91 })).toThrow(/coordonn/i)
    expect(() => calculateNatalTimeWindow(utc, 0 as TimeMargin)).toThrow(/marge/i)
    expect(() => read({ ...utc, date: '1900-01-01', time: '00:01' })).toThrow(/1900/)
    expect(() => read({ ...utc, date: '2100-12-31', time: '23:55' })).toThrow(/2100/)
  })
  it('rend la main en cours de calcul et abandonne une lecture devenue obsolète', async () => {
    expect(await readNatalTimeWindow(utc, 15, () => true)).toEqual(read(utc))
    let current = true
    const first = readNatalTimeWindow(utc, 60, () => current)
    current = false
    expect(await first).toBeNull()
  })
})
