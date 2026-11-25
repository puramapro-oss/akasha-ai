/**
 * Optional Swiss Ephemeris comparison. Run under Node 24 from the repository:
 * node scripts/natal-time-window.verify.mjs
 * Python 3.9+ with pyswisseph==2.10.3.2 and IANA tzdata must be available.
 * Set PYTHON to select a virtual environment. No reference file is left behind.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { calculateNatalTimeWindow } from '../src/lib/natal-time-window.ts'

const generator = fileURLToPath(new URL('./natal-reference.py', import.meta.url))
const cases = JSON.parse(execFileSync(process.env.PYTHON || 'python3', [generator, '--time-windows'], {
  encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
}))
const counts = { windows: 0, comparisons: 0, ascendantsWithheld: 0, ambiguous: 0, gap: 0 }

for (const caseData of cases) {
  for (const minutes of [5, 15, 30, 60]) {
    const { id, input } = caseData
    const label = id + ' / ' + (input.zodiac ?? 'tropical') + ' / ±' + minutes
    const result = calculateNatalTimeWindow(input, minutes)
    assert.equal(result.status, caseData.status, label)
    if (result.status !== 'estimated') {
      assert.deepEqual(result.choices, caseData.choices, label)
      counts[result.status]++
      continue
    }
    counts.windows++
    assert.equal(result.zodiac, input.zodiac, label)
    assert.equal(result.samples, 2 * minutes + 1, label)
    const expected = caseData.windows[minutes]
    const signs = Object.fromEntries(result.positions.map(position => [position.body, position.signs]))
    assert.deepEqual(Object.keys(signs).sort(), Object.keys(expected).filter(k => k !== 'ASC' && k !== 'MC').sort(), label)
    assert.equal(result.positions.length, Object.keys(signs).length, label + ' / duplicate body')
    Object.assign(signs, { ASC: result.ascendantSigns, MC: result.midheavenSigns })
    for (const [field, actual] of Object.entries(signs)) {
      const context = label + ' / ' + field
      const reference = expected[field]
      if (!reference || (field === 'ASC' && caseData.withholdAscendant)) {
        assert.deepEqual(actual, [], context + ' must remain indeterminate')
        if (reference) counts.ascendantsWithheld++
        continue
      }
      assert.ok(reference.observed.length > 0, context + ' missing reference values')
      assert.ok(reference.observed.every(sign => actual.includes(sign)), context + ' misses a reference sign')
      assert.ok(actual.every(sign => reference.allowed.includes(sign)), context + ' reports an unsupported sign')
      assert.equal(actual.length, new Set(actual).size, context + ' duplicate sign')
      counts.comparisons++
    }
  }
}

assert.deepEqual(counts, { windows: 420, comparisons: 4944, ascendantsWithheld: 48, ambiguous: 4, gap: 12 })
process.stdout.write('PASS · Swiss Ephemeris / estimated birth time · ' + JSON.stringify(counts) + '\n')
