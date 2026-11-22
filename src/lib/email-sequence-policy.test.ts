import { describe, expect, it } from 'vitest'
import { canSendSequence } from './email-sequence-policy'

const now = new Date('2026-11-22T12:00:00Z')
const row = (types: unknown, extra = {}) => ({ user_id: 'actor', types, ...extra })
describe('saved email preference interpretation', () => {
  it.each(['upgrade_day14', 'testimonial_day21', 'relaunch_day3', 'winback_day30'])('requires marketing opt-in for %s', type => {
    expect(canSendSequence(type, null, 'actor', now)).toBe(false)
    expect(canSendSequence(type, row({ newsletter: true }), 'actor', now)).toBe(true)
    expect(canSendSequence(type, row({ newsletter: false }), 'actor', now)).toBe(false)
  })
  it.each(['welcome', 'tip_day1'])('honors the product update setting for %s', type => {
    expect(canSendSequence(type, row({ product_updates: false }), 'actor', now)).toBe(false)
    expect(canSendSequence(type, row({ newsletter: false }), 'actor', now)).toBe(true)
  })
  it('honors the weekly digest setting independently', () => {
    expect(canSendSequence('tips_day7', row({ weekly_digest: false, newsletter: true }), 'actor', now)).toBe(false)
  })
  it.each([true, [], 'true', { user_id: 'other', types: {} }, row([]), row('true'), row({}, { paused_until: 'broken' })])('refuses malformed or foreign preferences %j', preferences => {
    expect(() => canSendSequence('welcome', preferences, 'actor', now)).toThrow()
  })
  it('does not treat a truthy non-boolean as permission', () => {
    expect(canSendSequence('upgrade_day14', row({ newsletter: 'true' }), 'actor', now)).toBe(false)
  })
  it('accepts an expired pause and rejects unscheduled types', () => {
    expect(canSendSequence('welcome', row({}, { paused_until: now.toISOString() }), 'actor', now)).toBe(true)
    expect(canSendSequence('referral_event', row({ newsletter: true }), 'actor', now)).toBe(false)
  })
})
