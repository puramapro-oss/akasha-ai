import { e_tilt, type AstroTime } from 'astronomy-engine'

export type NatalZodiac = 'tropical' | 'lahiri' | 'fagan-bradley'

export const ZODIAC_LABELS: Record<NatalZodiac, string> = {
  tropical: 'Tropical',
  lahiri: 'Sidéral Lahiri',
  'fagan-bradley': 'Sidéral Fagan–Bradley',
}

// Reference measurements, in degrees at JD 2451545.0 TT, mean equinox.
// Swiss Ephemeris 2.10.03: get_ayanamsa_ex(J2000, MOSEPH | NONUT),
// sidereal modes 1 (standard Lahiri) and 0 (Fagan/Bradley), respectively.
// https://www.astro.com/swisseph/swephprg.htm (Sidereal mode functions)
const MEAN_OFFSET_J2000 = { lahiri: 23.8570923254552, 'fagan-bradley': 24.7402999661813 }

/**
 * Subtract this offset (degrees) from apparent tropical longitude of date.
 * This is the conventional longitude subtraction on the ecliptic of date.
 * For 1900–2100 use a 0.001° allowance for the offset alone: daily samples
 * differed by at most 0.000075° from Swiss Ephemeris's apparent ayanamshas.
 */
export function zodiacOffset(time: AstroTime, zodiac: NatalZodiac): number {
  if (zodiac === 'tropical') return 0
  if (zodiac !== 'lahiri' && zodiac !== 'fagan-bradley') throw new RangeError('Zodiaque inconnu.')
  const t = time.tt / 36525
  // General precession in longitude p_A, arcseconds. Capitaine, Wallace &
  // Chapront (2003), eq. (39): https://syrte.obspm.fr/iau2006/aa03_412_P03.pdf
  const precession = 5028.796195 * t + 1.1054348 * t ** 2 + 0.00007964 * t ** 3
    - 0.000023857 * t ** 4 - 0.0000000383 * t ** 5
  // Ecliptic(GeoVector(...)) uses the true equinox. Its nutation in
  // longitude must also be included in the offset, with the same sign.
  return MEAN_OFFSET_J2000[zodiac] + (precession + e_tilt(time).dpsi) / 3600
}
