import { AstroTime } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { type NatalZodiac, ZODIAC_LABELS, zodiacOffset } from './natal-zodiac'

// Independent apparent offsets (degrees) from pyswisseph 2.10.3.2:
// set_sid_mode(SIDM_LAHIRI or SIDM_FAGAN_BRADLEY); get_ayanamsa_ex(jdTT, FLG_MOSEPH).
// JD is TT here so differences between the engines' Delta-T estimates drop out.
const references = [
  [2415020.5, 22.4653732256, 23.3485808482],
  [2433282.5, 23.1578075536, 24.0410151862],
  [2451545.0, 23.8532224563, 24.7364300970],
  [2452355.5, 23.8833613542, 24.7665689952],
  [2460000.5, 24.1779106520, 25.0611182958],
  [2486189.5, 25.1770712994, 26.0602789505],
  [2488433.5, 25.2705770921, 26.1537847436],
]

describe('repères de longitude zodiacale', () => {
  it.each(references)('vérifie les trois repères à JD %f TT', (jd, lahiri, faganBradley) => {
    const time = AstroTime.FromTerrestrialTime(jd - 2451545)
    expect(zodiacOffset(time, 'tropical')).toBe(0)
    expect(Math.abs(zodiacOffset(time, 'lahiri') - lahiri)).toBeLessThan(0.0001)
    expect(Math.abs(zodiacOffset(time, 'fagan-bradley') - faganBradley)).toBeLessThan(0.0001)
  })

  it('identifie les deux conventions sidérales distinctement', () => {
    expect(ZODIAC_LABELS.lahiri).toContain('Lahiri')
    expect(ZODIAC_LABELS['fagan-bradley']).toContain('Fagan')
    expect(() => zodiacOffset(AstroTime.FromTerrestrialTime(0), 'unknown' as NatalZodiac)).toThrow(RangeError)
  })
})
