import { describe, expect, it } from 'vitest'
import { calculateNatalChart, type NatalChart } from './natal-chart'
import { natalReflectionOptions } from './natal-reflection'

function chart(time: string, location = true, zodiac: NatalChart['zodiac'] = 'tropical') {
  const input = { date: '2000-01-01', time, zone: 'UTC', zodiac,
    ...(location ? { latitude: 48.86, longitude: 2.35 } : {}) }
  const result = calculateNatalChart(input)
  if (result.status !== 'chart') throw new Error(result.status)
  return result
}

describe('repères de réflexion locaux tirés du thème effectivement calculé', () => {
  it.each(['tropical', 'lahiri', 'fagan-bradley'] as const)('couvre le thème complet en %s', zodiac => {
    const source = chart('12:00', true, zodiac)
    const [overview, ...options] = natalReflectionOptions(source)
    expect(overview).toMatchObject({ id: 'overview', group: 'Vue d’ensemble' })
    expect(overview.basis).toEqual(options.map(option => option.label))
    expect(overview.question).toContain('Soleil en ')
    expect(overview.question).toContain('Lune en ')
    const closest = [...source.aspects].sort((a,b) => a.orb - b.orb)[0]
    expect(overview.question).toContain(closest.name.toLowerCase() + ' entre ')
    expect(options.filter(o => o.group === 'Astres').map(o => o.id))
      .toEqual(source.positions.map(p => 'body:' + p.body))
    expect(options.filter(o => o.group === 'Angles').map(o => o.id)).toEqual(['angle:ascendant', 'angle:midheaven'])
    expect(options.filter(o => o.group === 'Maisons')).toHaveLength(12)
    for (const p of source.positions.filter(p => p.house !== null)) {
      expect(options.find(o => o.id === 'house:' + p.house)?.label).toContain(p.label)
    }
    expect(options.filter(o => o.group === 'Aspects')).toHaveLength(source.aspects.length)
    expect(new Set(options.map(o => o.id)).size).toBe(options.length)
    expect(options.every(o => o.question.endsWith('?') && o.basis === undefined)).toBe(true)
    const convention = { tropical: 'Tropical', lahiri: 'Sidéral Lahiri', 'fagan-bradley': 'Sidéral Fagan–Bradley' }[zodiac]
    expect(options.every(o => o.label.includes(convention))).toBe(true)
    expect(JSON.stringify([overview, ...options])).not.toMatch(/2000-01-01|12:00|UTC|48\.86|2\.35/)
  })

  it('en heure inconnue, propose seulement Soleil, Lune et la synthèse de cette journée', () => {
    const source = chart('')
    const options = natalReflectionOptions(source)
    expect(options.map(o => o.id)).toEqual(['overview', 'body:Sun', 'body:Moon'])
    expect(options[0].question).toContain('possibles sur la journée')
    expect(options[0].basis).toHaveLength(2)
    expect(JSON.stringify(options)).not.toMatch(/Ascendant|Milieu du ciel|Maison [0-9]|entre Soleil et Lune/)
  })

  it('rend les deux hypothèses de signe visibles et change les pistes avec la carte', () => {
    const source = chart('')
    const moon = source.positions.find(p => p.body === 'Moon')!
    const first = natalReflectionOptions(source).find(o => o.id === 'body:Moon')!
    const alternative = { ...source, positions: [{ ...moon, signs: [11, 0] }] }
    const [overview, option] = natalReflectionOptions(alternative)
    expect(option.label).toContain('Poissons ou Bélier')
    expect(option.question).toContain('un moment d’imagination ou une initiative')
    expect(overview.question).toContain('Lune en Poissons ou Bélier')
    expect(first.question).not.toEqual(option.question)
  })

  it('garde un angle seul disponible, sans créer de maisons lorsque l’ascendant est indéterminé', () => {
    const polar = calculateNatalChart({ date: '2000-01-01', time: '12:00', zone: 'UTC', latitude: 70, longitude: 22.44818 })
    if (polar.status !== 'chart') throw new Error(polar.status)
    const options = natalReflectionOptions({ ...polar, aspects: [] })
    expect(options.some(o => o.id === 'angle:midheaven')).toBe(true)
    expect(options[0].question).toContain('Milieu du ciel')
    expect(options.some(o => o.id === 'angle:ascendant' || o.group === 'Maisons')).toBe(false)
    const unlocated = natalReflectionOptions(chart('12:00', false))
    expect(unlocated.some(o => o.group === 'Angles' || o.group === 'Maisons')).toBe(false)
  })

  it('associe aux cinq types d’aspects des questions différentes pour les deux thèmes retenus', () => {
    const source = chart('12:00')
    const names = ['Conjonction', 'Sextile', 'Carré', 'Trigone', 'Opposition']
    for (const name of names) {
      const options = natalReflectionOptions({ ...source, aspects: [{ first: 'Mercury', second: 'Saturn', name, orb: 2 }] })
      const aspect = options.find(o => o.group === 'Aspects')!
      expect(aspect.label).toContain(name + ' · Mercure et Saturne')
      expect(aspect.question).toContain('« la transmission » et « les limites »')
    }
    const variants = names.map(name => natalReflectionOptions({ ...source,
      aspects: [{ first: 'Mercury', second: 'Saturn', name, orb: 2 }] }).find(o => o.group === 'Aspects')!.question)
    expect(new Set(variants).size).toBe(5)
  })

  it('préserve le matériau du calcul et le système des maisons', () => {
    const source = chart('12:00')
    const snapshot = structuredClone(source)
    const a = natalReflectionOptions(source)
    expect(a).toEqual(natalReflectionOptions(source))
    expect(source).toEqual(snapshot)
    const equal = natalReflectionOptions({ ...source, houseSystem: 'equal' }).find(o => o.id === 'house:2')!
    expect(equal.label).toContain('maisons égales')
    expect(a.find(o => o.id === 'house:2')!.label).toContain('signes entiers')
  })
})
