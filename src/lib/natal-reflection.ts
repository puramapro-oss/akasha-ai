import type { NatalChart } from './natal-chart.ts'
import { zodiacSignNames } from './symbolic-cycles.ts'

export interface NatalReflectionOption {
  id: string
  group: 'Vue d’ensemble' | 'Astres' | 'Angles' | 'Maisons' | 'Aspects'
  label: string
  question: string
  basis?: string[]
}

// These are prompts for an optional exercise. No trait or goal is inferred.
const bodyPrompts: Record<string, { theme: string; question: string }> = {
  Sun: { theme: 'la priorité du moment', question: 'À quelle priorité aimerais-tu consacrer un moment cette semaine ?' },
  Moon: { theme: 'le rythme quotidien', question: 'Quel rythme rendrait cette activité plus accueillante pour toi aujourd’hui ?' },
  Mercury: { theme: 'la transmission', question: 'Quelle idée aimerais-tu rendre claire pour quelqu’un, et avec quel exemple ?' },
  Venus: { theme: 'ce que tu apprécies', question: 'Quel détail rendrait cette activité plus agréable ou plus belle à tes yeux ?' },
  Mars: { theme: 'le passage à l’action', question: 'Quel premier geste pourrais-tu essayer en quelques minutes ?' },
  Jupiter: { theme: 'la découverte', question: 'Quelle piste aimerais-tu découvrir, et où pourrais-tu en apprendre un peu plus ?' },
  Saturn: { theme: 'les limites', question: 'Quelle limite de temps ou d’effort rendrait ton projet tenable ?' },
  Uranus: { theme: 'le changement', question: 'Quelle petite variante pourrais-tu tester avant de modifier ton habitude ?' },
  Neptune: { theme: 'l’imagination', question: 'Quelle image exprimerait ton envie, et quel détail la rendrait concrète ?' },
  Pluto: { theme: 'la transformation', question: 'Quelle partie de ton projet voudrais-tu garder et laquelle pourrais-tu remanier ?' },
}

// Aries first, in the same order as the zodiac signs used by the chart.
const signLenses = [
  'une initiative', 'la continuité', 'un échange', 'un point d’appui familier',
  'une expression créative', 'un détail pratique', 'un accord à trouver', 'une évolution en profondeur',
  'une découverte', 'une étape à construire', 'une idée collective', 'un moment d’imagination',
] as const

const houseQuestions = [
  'Comment aimerais-tu te présenter au début de cette démarche ?',
  'De quelle ressource disposes-tu déjà pour faire un premier pas ?',
  'À qui aimerais-tu poser une question ou expliquer ton idée ?',
  'Quel aménagement de ton espace ou de tes habitudes pourrait te soutenir ?',
  'Quelle partie de ce projet aimerais-tu essayer pour le plaisir ?',
  'À quel moment de ta journée pourrais-tu essayer un petit geste régulier ?',
  'Avec qui aimerais-tu convenir d’une prochaine étape, si cette personne le souhaite aussi ?',
  'Quelle ressource ou responsabilité partagée voudrais-tu clarifier avec les personnes concernées ?',
  'Quelle perspective nouvelle aimerais-tu explorer dans une lecture ou un échange ?',
  'Quelle contribution concrète aimerais-tu pouvoir montrer à quelqu’un ?',
  'Quel projet commun aurais-tu envie de proposer à un groupe ?',
  'Quel moment de recul te laisserait le temps de décider de la suite ?',
] as const

const zodiacLabels: Record<NatalChart['zodiac'], string> = {
  tropical: 'Tropical', lahiri: 'Sidéral Lahiri', 'fagan-bradley': 'Sidéral Fagan–Bradley',
}

function signQuestion(signs: number[], question: string) {
  const lenses = signs.map(sign => signLenses[sign]).join(' ou ')
  return 'Tu peux prendre pour piste ' + lenses + '. ' + question
}

function aspectQuestion(name: string, first: string, second: string): string | undefined {
  const themes = '« ' + first + ' » et « ' + second + ' »'
  switch (name) {
    case 'Conjonction': return 'Quel petit geste pourrait réunir ' + themes + ' dans ton projet ?'
    case 'Sextile': return 'Quelle occasion simple pourrais-tu créer pour faire dialoguer ' + themes + ' ?'
    case 'Carré': return 'Si tu devais arbitrer entre ' + themes + ', quel essai t’aiderait à choisir ?'
    case 'Trigone': return 'Quel appui déjà présent pourrait faciliter un geste associant ' + themes + ' ?'
    case 'Opposition': return 'Comment pourrais-tu faire une place à ' + themes + ', éventuellement à deux moments différents ?'
  }
}

type ReflectionChart = Pick<NatalChart, 'positions' | 'ascendantSigns' | 'midheavenSigns' | 'cusps' | 'aspects' | 'houseSystem' | 'zodiac'> & {
  precision: NatalChart['precision'] | 'estimated'
}

/** Offer reflection only on features available in the already-computed chart. */
export function natalReflectionOptions(chart: ReflectionChart): NatalReflectionOption[] {
  const result: NatalReflectionOption[] = []
  const zodiac = zodiacLabels[chart.zodiac] + (chart.precision === 'estimated' ? ' · heure estimée' : '')
  const system = chart.houseSystem === 'equal' ? 'maisons égales' : 'signes entiers'
  function add(id: string, group: NatalReflectionOption['group'], label: string, question: string) {
    result.push({ id, group, label: label + ' · ' + zodiac, question })
  }

  for (const p of chart.positions) {
    if (!p.signs.length || !Object.hasOwn(bodyPrompts, p.body)) continue
    const house = p.house === null ? '' : ' · maison ' + p.house
    add('body:' + p.body, 'Astres', p.label + ' · ' + zodiacSignNames(p.signs) + house,
      signQuestion(p.signs, bodyPrompts[p.body].question))
  }
  if (chart.ascendantSigns.length) {
    add('angle:ascendant', 'Angles', 'Ascendant · ' + zodiacSignNames(chart.ascendantSigns),
      signQuestion(chart.ascendantSigns, 'Comment aimerais-tu aborder une première rencontre ou un nouveau départ ?'))
  }
  if (chart.midheavenSigns.length) {
    add('angle:midheaven', 'Angles', 'Milieu du ciel · ' + zodiacSignNames(chart.midheavenSigns),
      signQuestion(chart.midheavenSigns, 'Quel résultat aimerais-tu rendre visible, et auprès de qui ?'))
  }
  if (chart.cusps.length === 12) {
    for (const [i, question] of houseQuestions.entries()) {
      const number = i + 1
      const occupants = chart.positions.filter(p => p.house === number).map(p => p.label)
      const context = occupants.length ? ' · ' + occupants.join(', ') : ''
      // Both supported systems advance by one sign per cusp. Keep any
      // boundary ambiguity that the chart preserved for the equal houses.
      const signs = chart.ascendantSigns.map(sign => (sign + i) % 12)
      add('house:' + number, 'Maisons', 'Maison ' + number + ' · ' + zodiacSignNames(signs) + ' · ' + system + context,
        signQuestion(signs, question))
    }
  }
  const bodies = new Map(chart.positions.map(position => [position.body, position.label]))
  for (const a of chart.aspects) {
    if (!Object.hasOwn(bodyPrompts, a.first) || !Object.hasOwn(bodyPrompts, a.second)) continue
    const first = bodies.get(a.first)
    const second = bodies.get(a.second)
    const question = aspectQuestion(a.name, bodyPrompts[a.first].theme, bodyPrompts[a.second].theme)
    if (first && second && question) {
      add('aspect:' + a.first + ':' + a.second + ':' + a.name, 'Aspects', a.name + ' · ' + first + ' et ' + second, question)
    }
  }
  if (!result.length) return []
  const luminaries = chart.positions.filter(p => (p.body === 'Sun' || p.body === 'Moon') && p.signs.length)
  const anchors = luminaries.map(p => p.label + ' en ' + zodiacSignNames(p.signs))
  const closest = chart.aspects.reduce<NatalChart['aspects'][number] | undefined>(
    (best, candidate) => !best || candidate.orb < best.orb ? candidate : best, undefined)
  if (closest && bodies.has(closest.first) && bodies.has(closest.second)) {
    anchors.push(closest.name.toLowerCase() + ' entre ' + bodies.get(closest.first) + ' et ' + bodies.get(closest.second))
  } else if (chart.ascendantSigns.length === 1) {
    anchors.push('Ascendant en ' + zodiacSignNames(chart.ascendantSigns))
  } else if (chart.midheavenSigns.length === 1) {
    anchors.push('Milieu du ciel en ' + zodiacSignNames(chart.midheavenSigns))
  }
  const reading = { date: 'Repères possibles sur la journée', time: 'Repères du thème', estimated: 'Signes observés à la minute dans la fourchette estimée' }[chart.precision]
  const question = reading + ' (' + anchors.join(' · ') + '). ' +
    'Lequel aimerais-tu prendre comme point de départ, et quel premier geste irait dans le sens de ton envie ?'
  return [{ id: 'overview', group: 'Vue d’ensemble', label: 'Vue d’ensemble · ' + zodiac, question,
    basis: result.map(option => option.label) }, ...result]
}
