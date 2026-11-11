import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: () => { throw new Error('No provider call is permitted') } }
  },
}))

import { resolveModel } from '../../src/lib/claude'
import { AI_MODELS } from '../../src/lib/constants'
import { TOOLS } from '../../src/lib/tools-catalog'

beforeEach(() => { vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden') }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('explicit model selection', () => {
  for (const model of AI_MODELS) {
    it(`preserves ${model.id} from the catalogue route`, () => {
      const tool = TOOLS.find(entry => entry.id === model.id)
      expect(tool?.route).toBeTruthy()
      const route = new URL(tool!.route!, 'https://fixture.invalid')
      expect(route.pathname).toBe('/dashboard/chat')
      expect(route.searchParams.get('model')).toBe(model.id)
    })
  }

  it('refuses Opus for free rather than silently executing Sonnet', () => {
    expect(() => resolveModel('akasha-opus', 'free')).toThrow()
  })

  for (const alias of ['', 'unknown', '__proto__', 'constructor', 'akasha-opus ']) {
    it(`refuses the explicit invalid alias ${JSON.stringify(alias)}`, () => {
      expect(() => resolveModel(alias, 'complete')).toThrow()
    })
  }

  it('keeps the legacy model when no alias was supplied', () => {
    expect(resolveModel(undefined, 'free')).toBe('claude-haiku-4-5-20251001')
    expect(resolveModel(undefined, 'complete')).toBe('claude-sonnet-4-6')
  })

  it('honours an allowed explicit selection independently from the default', () => {
    expect(resolveModel('akasha-sonnet', 'free')).toBe('claude-sonnet-4-6')
    expect(resolveModel('akasha-haiku', 'complete')).toBe('claude-haiku-4-5-20251001')
    expect(resolveModel('akasha-opus', 'complete')).toBe('claude-opus-4-7')
  })
})
