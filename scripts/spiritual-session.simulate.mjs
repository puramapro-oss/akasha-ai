/**
 * Deterministic, offline checks of structured session settings and civil dates.
 * Run from the repository with Node 24: node scripts/spiritual-session.simulate.mjs
 * These counts describe test coverage, not users, natural-language prompts or
 * predictive accuracy.
 */
import assert from 'node:assert/strict'
import { buildSessionChatContext, composeSpiritualSession } from '../src/lib/spiritual-session.ts'

const modes = ['practical', 'mixed', 'spiritual']
const focuses = ['attention', 'kindness', 'discernment', 'gratitude', 'custom']
const guidanceLevels = ['guided', 'quiet']
const choices = [false, true]
const ascendants = [undefined, ...Array.from({ length: 12 }, (_, index) => index)]
const signs = ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge',
  'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons']
const rulers = ['Mars', 'Vénus', 'Mercure', 'Lune', 'Soleil', 'Mercure',
  'Vénus', 'Mars', 'Jupiter', 'Saturne', 'Saturne', 'Jupiter']

// Expected ages were written manually, independently of the application's code.
const profiles = [
  { asOfDate: '2026-11-25' },
  { birthDate: '1998-03-01', asOfDate: '2026-02-28', age: 27 },
  { birthDate: '1988-01-04', asOfDate: '2000-01-04', age: 12 },
  { birthDate: '2000-01-08', asOfDate: '2000-01-08', age: 0 },
  { birthDate: '2000-02-29', asOfDate: '2025-02-28', age: 24 },
  { birthDate: '2000-02-29', asOfDate: '2025-03-01', age: 25 },
  { birthDate: '2000-02-29', asOfDate: '2024-02-29', age: 24 },
  { birthDate: '2026-11-28', asOfDate: '2026-11-28', age: 0 },
  { birthDate: '6997-01-01', asOfDate: '7000-01-01', age: 3 },
  { birthDate: '1900-01-01', asOfDate: '2030-12-31', age: 130 },
]

// Independent JYOTI oracle: sum the three civil components first; perform
// subsequent digit sums arithmetically and retain 11, 22 and 33 when reached.
function referenceNumber(date) {
  const [year, month, day] = date.split('-').map(Number)
  let value = day + month + year
  while (value > 9 && ![11, 22, 33].includes(value)) {
    let next = 0
    while (value > 0) {
      next += value % 10
      value = Math.trunc(value / 10)
    }
    value = next
  }
  return value
}

const goldenNumbers = [
  ['1988-01-04', 22], ['2000-01-08', 11], ['6997-01-01', 33],
  ['2026-11-28', 4], ['2002-05-10', 1],
]

const base = {
  mode: 'mixed', focus: 'attention', minutes: 3, guidance: 'guided',
  useAstrology: true, useNumerology: true,
  birthDate: '2000-02-29', asOfDate: '2025-03-01',
}

function verifySteps(steps, minutes) {
  assert.ok(Array.isArray(steps) && steps.length > 0)
  const ids = new Set()
  let seconds = 0
  for (const step of steps) {
    assert.ok(typeof step.id === 'string' && step.id.trim() !== '' && !ids.has(step.id))
    assert.ok(typeof step.text === 'string' && step.text.trim() !== '')
    assert.ok(Number.isInteger(step.seconds) && step.seconds > 0)
    ids.add(step.id)
    seconds += step.seconds
  }
  assert.equal(seconds, minutes * 60)
}

function verifyCycles(snapshot, age, ascendant) {
  const offset = age % 12
  assert.equal(snapshot.age, age)
  assert.equal(snapshot.annualProfection.house, offset + 1)
  assert.equal(snapshot.annualProfection.requiresAscendant, ascendant === undefined)
  const index = (ascendant + offset) % 12
  assert.equal(snapshot.annualProfection.sign, ascendant === undefined ? null : signs[index])
  assert.equal(snapshot.annualProfection.traditionalRuler, ascendant === undefined ? null : rulers[index])
  assert.equal(snapshot.cosmicClock.line, offset)
  assert.equal(snapshot.cosmicClock.sign, signs[(9 + offset) % 12])
  assert.equal(snapshot.cosmicClock.revolution, Math.floor(age / 12) + 1)
}

function verifyConfiguration(input, expectedAge, expectedNumber) {
  const session = composeSpiritualSession(input)
  assert.equal(session.mode, input.mode)
  assert.equal(session.guidance, input.guidance)
  assert.equal(session.focus, input.focus)
  verifySteps(session.steps, input.minutes)

  const symbols = input.mode !== 'practical'
  const hasBirth = input.birthDate !== undefined
  const requested = input.useAstrology || input.useNumerology
  assert.equal(session.needsBirthDate, symbols && requested && !hasBirth)
  assert.equal(session.number, symbols && hasBirth && input.useNumerology ? expectedNumber : null)
  if (symbols && hasBirth && input.useAstrology) {
    verifyCycles(session.cycles, expectedAge, input.ascendantSign)
  } else {
    assert.equal(session.cycles, null)
  }
}

// Generate the Cartesian product lazily. Every complete tuple is visited once.
function* combinations(ranges, index = 0, current = {}) {
  if (index === ranges.length) {
    yield { ...current }
    return
  }
  const [key, values] = ranges[index]
  for (const value of values) {
    current[key] = value
    yield* combinations(ranges, index + 1, current)
  }
}

function configurationMatrix() {
  const ranges = Object.entries({
    mode: modes,
    focus: focuses,
    guidance: guidanceLevels,
    useAstrology: choices,
    useNumerology: choices,
    ascendantSign: ascendants,
    minutes: Array.from({ length: 30 }, (_, index) => index + 1),
  })
  let count = 0
  for (const { age, ...dates } of profiles) {
    const expectedNumber = dates.birthDate && referenceNumber(dates.birthDate)
    for (const preferences of combinations(ranges)) {
      const input = { ...preferences, ...dates }
      try {
        verifyConfiguration(input, age, expectedNumber)
      } catch (error) {
        throw new Error('Configuration: ' + JSON.stringify(input), { cause: error })
      }
      count++
    }
  }
  const expectedCount = ranges.reduce((size, [, values]) => size * values.length, profiles.length)
  assert.equal(count, expectedCount)
  return count
}

function exhaustiveCivilDates() {
  let count = 0
  const histogram = {}
  const last = Date.UTC(2099, 11, 31)
  for (let time = Date.UTC(1900, 0, 1); time <= last; time += 86400000) {
    const birthDate = new Date(time).toISOString().slice(0, 10)
    const session = composeSpiritualSession({ ...base, useAstrology: false, birthDate, asOfDate: birthDate })
    const expected = referenceNumber(birthDate)
    assert.equal(session.number, expected, birthDate)
    assert.equal(session.cycles, null, birthDate)
    histogram[expected] = (histogram[expected] ?? 0) + 1
    count++
  }
  assert.equal(count, 73049)
  return { count, numericResultCounts: histogram }
}

function negativeAndPreferenceChecks() {
  let rejected = 0
  for (const [property, values] of Object.entries({
    minutes: [0, 31, 1.5, NaN, Infinity, '3', null],
    mode: ['', 'Practical', '__proto__', null],
    focus: ['', 'other', 'toString', null, ['attention'], Object.create(null)],
    guidance: ['', 'GUIDED', null],
    useAstrology: [0, 1, 'true', null],
    useNumerology: [0, 1, 'true', null],
    birthDate: [false, 0, null],
    techniques: [null, 'mantra', ['unknown'], [null], ['__proto__'], [['prayer']], Array(1), { 0: 'prayer', length: 1 }],
    ascendantSign: [-1, 12, 4.5],
  })) {
    for (const value of values) {
      assert.throws(() => composeSpiritualSession({ ...base, [property]: value }), RangeError, property + ':' + JSON.stringify(value))
      rejected++
    }
  }
  const invalidPairs = [
    ['1900-02-29', '2000-01-01'], ['2001-02-29', '2026-11-25'],
    ['2000-04-31', '2026-11-25'], ['2000-00-10', '2026-11-25'],
    ['2000-01-00', '2026-11-25'], ['2000-1-1', '2026-11-25'],
    ['2000-01-01T00:00:00Z', '2026-11-25'], ['2000-01-01', '2026-02-29'],
    ['2000-01-01', '1999-12-31'], ['1900-01-01', '2031-01-01'],
  ]
  for (const [birthDate, asOfDate] of invalidPairs) {
    for (const [useAstrology, useNumerology] of [[true, false], [false, true], [true, true]]) {
      assert.throws(() => composeSpiritualSession({ ...base, birthDate, asOfDate, useAstrology, useNumerology }),
        RangeError, birthDate + ' / ' + asOfDate)
      rejected++
    }
  }

  // Changing undisclosed/irrelevant birth data cannot influence a practical session.
  const practical = { ...base, mode: 'practical' }
  assert.deepEqual(composeSpiritualSession(practical), composeSpiritualSession({
    ...practical, birthDate: 'unreadable', asOfDate: 'unreadable', ascendantSign: 50,
  }))
  const neither = { ...base, useAstrology: false, useNumerology: false }
  assert.deepEqual(composeSpiritualSession(neither), composeSpiritualSession({
    ...neither, birthDate: 'unreadable', asOfDate: 'unreadable',
  }))
  const input = Object.freeze({ ...base })
  const answer = composeSpiritualSession(input)
  assert.deepEqual(answer, composeSpiritualSession(input))
  assert.notDeepEqual(answer.steps, composeSpiritualSession({ ...input, guidance: 'quiet' }).steps)
  assert.notDeepEqual(answer.steps, composeSpiritualSession({ ...input, focus: 'kindness' }).steps)
  for (const [birthDate, expected] of goldenNumbers) {
    assert.equal(referenceNumber(birthDate), expected)
    assert.equal(composeSpiritualSession({ ...base, birthDate, asOfDate: birthDate }).number, expected, birthDate)
  }
  return rejected
}

// Exercise every ordered selection without replacement, including the empty set.
function* orderedSelections(remaining, selected = []) {
  yield selected
  for (const technique of remaining) {
    yield* orderedSelections(remaining.filter(other => other !== technique), [...selected, technique])
  }
}

function techniqueSessions() {
  const techniques = ['observation', 'writing', 'visualization', 'kindness', 'mantra', 'prayer']
  const practicalTechniques = ['observation', 'writing', 'visualization', 'kindness']
  let selections = 0
  let configurations = 0
  let duplicateChecks = 0
  for (const selection of orderedSelections(techniques)) {
    selections++
    for (const mode of modes) {
      const expected = mode === 'practical' ? selection.filter(key => practicalTechniques.includes(key)) : selection
      const expectedIds = expected.length ? expected : ['explore']
      for (const guidance of guidanceLevels) {
        for (let minutes = 1; minutes <= 30; minutes++) {
          const input = { ...base, techniques: selection, mode, minutes, guidance }
          const result = composeSpiritualSession(input)
          assert.deepEqual(result.techniques, expected)
          assert.deepEqual(result.steps.slice(1, -1).map(step => step.id), expectedIds)
          verifySteps(result.steps, minutes)
          configurations++
        }
      }
      if (selection.length) {
        const input = { ...base, mode, techniques: selection }
        const repeated = [...selection, ...selection.toReversed()]
        assert.deepEqual(composeSpiritualSession({ ...input, techniques: repeated }), composeSpiritualSession(input))
        duplicateChecks++
      }
    }
  }
  assert.equal(selections, 1957)
  assert.equal(configurations, 352260)
  return { selections, configurations, duplicateChecks }
}

// Exercise the real consent-gated chat handoff. Reaching a prompt builder
// establishes fidelity of transport, not the quality of a model's replies.
function chatHandoffs() {
  const requests = [
    'Je voudrais écouter avec attention', 'Je veux exprimer ma gratitude',
    'Je souhaite poser une limite', 'Je cherche un moment de silence',
    'J’aimerais prendre du recul', 'Je veux comparer deux points de vue',
    'J’aimerais faire preuve de patience', 'Je voudrais préparer quelques mots',
    'Je souhaite comprendre une tradition', 'Je veux réfléchir à un choix',
  ]
  const settings = [
    'pendant une promenade', 'à la maison', 'dans le train', 'au réveil',
    'après une journée chargée', 'au travail', 'en voyage', 'dans le jardin',
  ]
  const formats = [
    'Donne un exemple.', 'Propose deux formulations.', 'Commence par une question.',
    'Explique simplement.', 'Garde un ton sobre.', 'Privilégie une question ouverte.',
  ]
  const closings = [
    'Je préfère lire.', 'Je veux réfléchir ensuite.', 'Laisse-moi choisir la suite.',
    'Je souhaite pouvoir faire une pause.', 'Je pourrai reformuler dans mes mots.',
  ]
  const variables = Object.entries({ request: requests, setting: settings, format: formats, closing: closings })
  const seen = new Set()
  for (const { request, setting, format, closing } of combinations(variables)) {
    const question = request + ' ' + setting + '. ' + format + '\n' + closing
    assert.ok(!seen.has(question))
    const index = seen.size
    seen.add(question)
    const input = {
      ...base, mode: modes[index % modes.length], focus: focuses[index % focuses.length],
      guidance: guidanceLevels[index % 2], useAstrology: index % 4 < 2, useNumerology: index % 2 === 0,
    }
    const result = buildSessionChatContext(input, { consent: true, question })
    assert.ok(result.endsWith(question))
    assert.ok(!result.includes(input.birthDate) && !result.includes(input.asOfDate))
    assert.equal(result.includes('Horloge cosmique'), input.mode !== 'practical' && input.useAstrology)
    assert.equal(result.includes('JYOTI'), input.mode !== 'practical' && input.useNumerology)
    assert.equal(buildSessionChatContext(input, { consent: false, question }), '')
  }

  const todayYear = new Date().getFullYear()
  const minor = { ...base, birthDate: String(todayYear - 10) + '-01-01', asOfDate: String(todayYear + 20) + '-01-01' }
  assert.throws(() => buildSessionChatContext(minor, { consent: true, question: 'Ma demande.' }), RangeError)
  assert.throws(() => buildSessionChatContext({ ...base, birthDate: undefined }, { consent: true, question: 'Ma demande.' }), RangeError)
  assert.equal(buildSessionChatContext(minor, { consent: false, question: 'Ma demande.' }), '')
  for (const question of ['A'.repeat(1500), 'Précision – café, élan 🌙', 'ما المقصود؟', 'これは何ですか？']) {
    assert.ok(buildSessionChatContext(base, { consent: true, question }).endsWith(question))
  }
  assert.throws(() => buildSessionChatContext(base, { consent: true, question: 'A'.repeat(1501) }), RangeError)
  assert.equal(seen.size, 2400)
  return seen.size
}

const rejectedInvalidInputs = negativeAndPreferenceChecks()
const structuredConfigurations = configurationMatrix()
const calendar = exhaustiveCivilDates()
const techniques = techniqueSessions()
process.stdout.write(JSON.stringify({
  status: 'PASS',
  structuredConfigurations,
  orderedTechniqueSelections: techniques.selections,
  techniqueSessionConfigurations: techniques.configurations,
  duplicateTechniqueComparisons: techniques.duplicateChecks,
  calendarDatesChecked: calendar.count,
  calendarStart: '1900-01-01',
  calendarEnd: '2099-12-31',
  numericResultCounts: calendar.numericResultCounts,
  rejectedInvalidInputs,
  distinctTextHandoffs: chatHandoffs(),
  masterNumberAndConventionFixtures: goldenNumbers.length,
  scope: 'Session outputs and consent-gated prompt construction. No generated answers, user evaluation or predictive accuracy measured.',
}, null, 2) + '\n')
