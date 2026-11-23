import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { emailDatabase, emailRpc, inspectEmailDatabase, resetEmailDatabase, USER } from '../../tests/email-sequences/sql-fixture'

let db: PGlite
beforeAll(async () => { db = await emailDatabase() }, 20_000)
beforeEach(async () => { await resetEmailDatabase(db) })
afterAll(async () => { await db?.close() })
async function preferences(types: unknown, pause: string | null = null) {
  await db.exec('RESET ROLE')
  try { await db.query('UPDATE akasha_ai.notification_preferences SET types=$1,paused_until=$2 WHERE user_id=$3', [types, pause, USER]) }
  finally { await db.exec('SET ROLE service_role') }
}
const claim = (type = 'welcome') => emailRpc(db, 'claim', { p_email_type: type })

describe('one SQL admission authority preserves explicit preferences', () => {
  it.each(['welcome', 'tip_day1', 'relaunch_day3', 'tips_day7', 'upgrade_day14', 'testimonial_day21', 'winback_day30'])(
    '%s requires stored newsletter consent even when another category is enabled', async type => {
      await preferences({ product_updates: true, weekly_digest: true })
      expect(await claim(type)).toMatchObject({ status: 'not_subscribed' })
      await preferences({ newsletter: false, product_updates: true, weekly_digest: true })
      expect(await claim(type)).toMatchObject({ status: 'not_subscribed' })
      await preferences({ newsletter: 'true' })
      expect(await claim(type)).toMatchObject({ status: 'not_subscribed' })
      await preferences({ newsletter: true })
      expect(await claim(type)).toMatchObject({ status: 'claimed' })
    },
  )

  it.each(['welcome', 'tip_day1'])('preserves an explicit product-update veto for %s', async type => {
    await preferences({ newsletter: true, product_updates: false })
    expect(await claim(type)).toMatchObject({ status: 'not_subscribed' })
    expect(await inspectEmailDatabase(db)).toEqual({ journals: [], logs: 0 })
    await preferences({ newsletter: true, product_updates: true })
    expect(await claim(type)).toMatchObject({ status: 'claimed' })
  })

  it('preserves the explicit weekly-digest veto', async () => {
    await preferences({ newsletter: true, weekly_digest: false })
    expect(await claim('tips_day7')).toMatchObject({ status: 'not_subscribed' })
    expect(await inspectEmailDatabase(db)).toEqual({ journals: [], logs: 0 })
    await preferences({ newsletter: true, weekly_digest: true })
    expect(await claim('tips_day7')).toMatchObject({ status: 'claimed' })
  })

  it('does not apply a product or digest veto to an unrelated newsletter type', async () => {
    await preferences({ newsletter: true, product_updates: false, weekly_digest: false })
    expect(await claim('upgrade_day14')).toMatchObject({ status: 'claimed' })
  })

  it.each([null, true, [], 'true'])('refuses malformed stored categories %j', async types => {
    await preferences(types)
    expect(await claim()).toMatchObject({ status: 'not_subscribed' })
    expect(await inspectEmailDatabase(db)).toEqual({ journals: [], logs: 0 })
  })

  it('does not invent consent when the preference row is absent', async () => {
    await db.exec('RESET ROLE; DELETE FROM akasha_ai.notification_preferences; SET ROLE service_role')
    expect(await claim()).toMatchObject({ status: 'not_subscribed' })
  })

  it('does not use another profile preference row as the recipient consent', async () => {
    await db.exec('RESET ROLE; DELETE FROM akasha_ai.notification_preferences')
    const other = '44444444-4444-4444-8444-444444444444'
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [other])
    await db.query('INSERT INTO akasha_ai.profiles(id,email) VALUES($1,$2)', [other, 'other@example.invalid'])
    await db.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [other])
    await db.exec('SET ROLE service_role')
    expect(await claim()).toMatchObject({ status: 'not_subscribed' })
  })

  it('rejects malformed pause dates at the real typed database boundary', async () => {
    await expect(preferences({ newsletter: true }, 'broken')).rejects.toMatchObject({ code: '22007' })
    expect(await inspectEmailDatabase(db)).toEqual({ journals: [], logs: 0 })
  })

  it('honors a future pause and admits only after an expired pause', async () => {
    await preferences({ newsletter: true }, '9999-01-01T00:00:00Z')
    expect(await claim()).toMatchObject({ status: 'paused' })
    await preferences({ newsletter: true }, '2000-01-01T00:00:00Z')
    expect(await claim()).toMatchObject({ status: 'claimed' })
  })

  it.each(['referral_event', 'contest_event', 'milestone_event'])('refuses the unscheduled type %s', async type => {
    await expect(claim(type)).rejects.toMatchObject({ code: '22023' })
    expect(await inspectEmailDatabase(db)).toEqual({ journals: [], logs: 0 })
  })
})
