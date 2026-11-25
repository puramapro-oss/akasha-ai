import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculateNatalChart } from './natal-chart'

type Input = Parameters<typeof calculateNatalChart>[0]
type Chart = Extract<ReturnType<typeof calculateNatalChart>, { status: 'chart' }>
type Zodiac = 'tropical' | 'lahiri' | 'fagan-bradley'
type ReferenceValues = {
  ayanamsha?: number
  positions: Record<string, number>
  equalCusps: number[]
  ascendant: number
  midheaven: number
}

type Reference = ReferenceValues & {
  id: string
  input: Input
  sidereal?: Partial<Record<Zodiac, ReferenceValues>>
}
type DayReference = { input: Input; sampledSigns: Record<string, number[]>; allowedSigns: Record<string, number[]> }
function readReferenceFile(path: string | URL): { cases: Reference[]; days: DayReference[] } {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const fixture = readReferenceFile(new URL('../../tests/fixtures/natal-reference.json', import.meta.url))
const curated = fixture.cases
const paris = curated.find(row => row.id === 'paris-j2000')!
const longitudeTolerance = 0.04
const angleTolerance = 0.01
const displayGuard = 0.05

function distance(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

function normalize(value: number) {
  return ((value % 360) + 360) % 360
}

function chart(input: Input): Chart {
  const result = calculateNatalChart(input)
  assert.ok(result.status === 'chart', JSON.stringify(input))
  return result
}

type Worst = { degrees: number; case: string; field: string }

function collect(worst: Worst, calculated: number | null, target: number, id: string, field: string) {
  assert.ok(calculated !== null && Number.isFinite(calculated) && calculated >= 0 && calculated < 360,
    id + ': ' + field + ' has invalid longitude ' + String(calculated))
  const degrees = distance(calculated, target)
  if (worst.degrees < degrees) Object.assign(worst, { degrees, case: id, field })
}

function verifyAspects(result: Chart, targets: Record<string, number>, id: string) {
  const fixedAngles = { Conjonction: 0, Sextile: 60, Carré: 90, Trigone: 120, Opposition: 180 }
  const pairKey = (a: string, b: string) => [a, b].sort().join('-')
  const reported = new Map(result.aspects.map(aspect => [pairKey(aspect.first, aspect.second), aspect]))
  assert.equal(reported.size, result.aspects.length, id + ': no duplicate pairs')
  const bodies = Object.keys(targets)
  for (const [i, body] of bodies.entries()) {
    for (const other of bodies.slice(i + 1)) {
      const actual = reported.get(pairKey(body, other))
      const separation = distance(targets[body], targets[other])
      const match = Object.entries(fixedAngles).find(([, angle]) => Math.abs(separation - angle) <= 6 + 2 * longitudeTolerance)
      if (!match) {
        assert.equal(actual, undefined, id + ': out-of-range aspect')
        continue
      }
      const [name, angle] = match
      const expectedOrb = Math.abs(separation - angle)
      if (expectedOrb < 6 - 2 * longitudeTolerance) assert.ok(actual, id + ': missing aspect')
      if (actual) {
        assert.equal(actual.name, name)
        assert.ok(Math.abs(actual.orb - expectedOrb) <= 2 * longitudeTolerance, id + ': aspect orb')
      }
    }
  }
}

function compareReferences(rows: Reference[], zodiac: Zodiac) {
  let inputs = 0
  const orientation: Worst = { degrees: -1, case: '', field: '' }
  const positions: Worst = { degrees: -1, case: '', field: '' }
  const ascendants: Worst = { ...positions }
  const midheavens: Worst = { ...positions }
  const cusps: Worst = { ...positions }
  let housesChecked = 0
  for (const row of rows) {
    const values = zodiac === 'tropical' ? row : row.sidereal?.[zodiac]
    if (!values) continue
    const reference = { ...values, id: row.id, input: row.input }
    inputs++
    for (const houseSystem of ['equal', 'whole-sign'] as const) {
      const result = chart({ ...reference.input, houseSystem, zodiac })
      assert.equal(result.zodiac, zodiac)
      if (reference.ayanamsha !== undefined) collect(orientation, result.ayanamsha, reference.ayanamsha, reference.id, 'ayanamsha')
      if (houseSystem === 'equal') verifyAspects(result, reference.positions, reference.id)
      assert.equal(result.precision, 'time')
      assert.equal(result.houseSystem, houseSystem)
      assert.deepEqual(result.positions.map(p => p.body).sort(), Object.keys(reference.positions).sort())
      collect(ascendants, result.ascendant, reference.ascendant, reference.id, 'ASC')
      collect(midheavens, result.midheaven, reference.midheaven, reference.id, 'MC')
      const ascendantFromBoundary = reference.ascendant % 30
      const guardCouldApply = Math.min(ascendantFromBoundary, 30 - ascendantFromBoundary) <= displayGuard + angleTolerance
      if (houseSystem === 'whole-sign' && guardCouldApply && !result.cusps.length) {
        assert.ok(result.positions.every(p => p.house === null))
      } else {
        assert.equal(result.cusps.length, 12)
      }
      const first = houseSystem === 'equal' ? reference.equalCusps[0] : Math.floor(reference.ascendant / 30) * 30
      for (let i = 0; i < result.cusps.length; i++) {
        const expected = houseSystem === 'equal' ? reference.equalCusps[i] : normalize(first + i * 30)
        collect(cusps, result.cusps[i], expected, reference.id, houseSystem + ' cusp ' + (i + 1))
      }
      for (const p of result.positions) {
        const target = reference.positions[p.body]
        collect(positions, p.longitude, target, reference.id, p.body)
        const inSign = target % 30
        assert.ok(p.signs.includes(Math.floor(target / 30)), reference.id + ': admissible sign of ' + p.body)
        if (Math.min(inSign, 30 - inSign) > longitudeTolerance + displayGuard) {
          assert.deepEqual(p.signs, [Math.floor(target / 30)], reference.id + ': sign of ' + p.body)
        }
        const fromFirst = normalize(target - first)
        const inHouse = fromFirst % 30
        if (result.cusps.length && Math.min(inHouse, 30 - inHouse) > longitudeTolerance + angleTolerance + displayGuard) {
          assert.equal(p.house, 1 + Math.floor(fromFirst / 30), reference.id + ': house of ' + p.body)
          housesChecked++
        }
      }
    }
  }
  const metrics = { zodiac, chartsPerHouseSystem: inputs, housesChecked, positions, ascendants, midheavens, cusps,
    ayanamsha: zodiac === 'tropical' ? null : orientation }
  assert.ok(inputs > 0)
  if (process.env.NATAL_REFERENCE_FILE) process.stdout.write(JSON.stringify(metrics) + '\n')
  for (const [metric, tolerance] of [[positions, longitudeTolerance], [ascendants, angleTolerance],
    [midheavens, angleTolerance], [cusps, angleTolerance], [orientation, 0.001]] as const) {
    assert.ok(metric.degrees <= tolerance, JSON.stringify({ ...metric, tolerance }))
  }
}

describe('natal chart against Swiss Ephemeris, independently generated test references', () => {
  it.each(['tropical', 'lahiri', 'fagan-bradley'] as const)('checks %s longitudes, angles, houses and major aspects', zodiac => {
    const samples = process.env.NATAL_REFERENCE_FILE
    compareReferences(samples ? readReferenceFile(samples).cases : curated, zodiac)
  }, 180_000)

  it('uses the chosen occurrence and never resolves a missing civil minute by substitution', () => {
    const input = { ...paris.input, date: '2024-10-27', time: '02:30' }
    const ambiguous = calculateNatalChart(input)
    assert.ok(ambiguous.status === 'ambiguous')
    expect(ambiguous.choices.map(value => new Date(value).toISOString())).toEqual([
      '2024-10-27T00:30:00.000Z', '2024-10-27T01:30:00.000Z',
    ])
    expect(calculateNatalChart({ ...input, date: '2024-03-31' }).status).toBe('gap')
  })

  it('preserves geocentric positions when coordinates are omitted; polar angles stay indeterminate', () => {
    const geo = chart(paris.input)
    for (const latitude of [undefined, 90, -90]) {
      const input = { ...paris.input, latitude, longitude: latitude === undefined ? undefined : 0 }
      const partial = chart(input)
      expect(partial.ascendant).toBeNull()
      expect(partial.midheaven).toBeNull()
      expect(partial.cusps).toEqual([])
      expect(partial.positions.map(p => p.longitude)).toEqual(geo.positions.map(p => p.longitude))
      expect(partial.positions.every(p => p.house === null)).toBe(true)
    }
  })

  it.each([
    // Near-coincident planes: at 66.5623°N Swiss gives 334.78745° and the
    // nominal intersection here gives 312.38350°. Publishing either sign
    // as certain would depend on tiny differences in the sky model.
    [66.5623, -10.4571], [-66.5623, 169.5429],
    // Tangential rise at higher latitude: the eastern ray can reverse.
    [70, 22.44818], [-70, 136.63773],
  ])('keeps only stable angles near a polar singularity at %f, %f', (latitude, longitude) => {
    for (const houseSystem of ['whole-sign', 'equal'] as const) {
      const result = chart({ date: '2000-01-01', time: '12:00', zone: 'UTC', latitude, longitude, houseSystem })
      expect(result.ascendant).toBeNull()
      expect(result.ascendantSigns).toEqual([])
      expect(result.cusps).toEqual([])
      expect(result.positions).toHaveLength(10)
      expect(result.positions.every(p => p.longitude !== null && p.house === null)).toBe(true)
      expect(result.midheaven).not.toBeNull()
    }
  })

  it.each(fixture.days)('checks unknown time against minute samples: $input.date / $input.zone / $input.zodiac', row => {
    const result = chart(row.input)
    expect(result.precision).toBe('date')
    expect([result.ascendant, result.midheaven, result.cusps, result.aspects]).toEqual([null, null, [], []])
    expect(result.positions.map(p => p.body).sort()).toEqual(['Moon', 'Sun'])
    for (const p of result.positions) {
      expect(p.longitude).toBeNull()
      expect(p.house).toBeNull()
      expect(row.sampledSigns[p.body].every(sign => p.signs.includes(sign))).toBe(true)
      expect(p.signs.every(sign => row.allowedSigns[p.body].includes(sign))).toBe(true)
    }
  })
})
