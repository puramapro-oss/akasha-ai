import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { ATTEMPT, SECOND_ATTEMPT, USER, emailDatabase, emailRpc, inspectEmailDatabase, resetEmailDatabase } from '../../../tests/email-sequences/sql-fixture'

let db: PGlite
beforeAll(async () => { db = await emailDatabase() }, 20_000)
beforeEach(async () => { await resetEmailDatabase(db) })
afterAll(async () => { await db?.close() })

describe('email admission and completion on real in-process PostgreSQL', () => {
  it('reserves one attempt, finalizes a matching acceptance and preserves the single log', async () => {
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'claimed', version: 1, user_id: USER, attempt_token: ATTEMPT })
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'reconciliation_required' })
    expect(await emailRpc(db, 'complete')).toMatchObject({ status: 'sent', provider_email_id: 'synthetic-provider-id' })
    expect(await emailRpc(db, 'complete')).toMatchObject({ status: 'sent' })
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'already_sent' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 1, journals: [{ state: 'sent', reason: null }] })
  })

  it.each([null, {}, [], { newsletter: false }, { newsletter: 'true' }, { newsletter: 1 },
    { newsletter: null }, { product_updates: true, weekly_digest: true }])('requires explicit boolean newsletter choice: %j', async types => {
    await db.exec('RESET ROLE')
    await db.query('UPDATE akasha_ai.notification_preferences SET types=$1 WHERE user_id=$2', [types, USER])
    await db.exec('SET ROLE service_role')
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'not_subscribed' })
    expect(await inspectEmailDatabase(db)).toEqual({ logs: 0, journals: [] })
  })

  it('does not manufacture consent when no preference row exists', async () => {
    await db.exec('RESET ROLE; DELETE FROM akasha_ai.notification_preferences; SET ROLE service_role')
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'not_subscribed' })
    expect(await inspectEmailDatabase(db)).toEqual({ logs: 0, journals: [] })
  })

  it('honors an active pause and allows a new claim only when the stored pause expired', async () => {
    await db.exec("RESET ROLE; UPDATE akasha_ai.notification_preferences SET paused_until=clock_timestamp()+interval '1 hour'; SET ROLE service_role")
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'paused' })
    expect(await inspectEmailDatabase(db)).toEqual({ logs: 0, journals: [] })
    await db.exec("RESET ROLE; UPDATE akasha_ai.notification_preferences SET paused_until=clock_timestamp()-interval '1 hour'; SET ROLE service_role")
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'claimed' })
  })

  it.each([
    { p_email_type: 'referral_event' }, { p_email_type: 'unknown' }, { p_email_type: null },
    { p_attempt_token: null }, { p_user_id: null }, { p_payload_hash: 'invalid' },
    { p_payload_hash: null }, { p_recipient: 'another@example.invalid' }, { p_recipient: null },
  ])('rejects invalid or changed admission identity %j before a claim', async overrides => {
    await expect(emailRpc(db, 'claim', overrides)).rejects.toMatchObject({ code: '22023' })
    expect(await inspectEmailDatabase(db)).toEqual({ logs: 0, journals: [] })
  })

  it('keeps legacy claims ambiguous even after the old row is deleted', async () => {
    await db.exec('RESET ROLE')
    await db.query('INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,$2)', [USER, 'welcome'])
    await db.exec('SET ROLE service_role')
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'reconciliation_required' })
    await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
    await db.exec('RESET ROLE; DELETE FROM akasha_ai.email_sequences; SET ROLE service_role')
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'reconciliation_required' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ reason: 'legacy_receipt' }] })
  })

  it('does not release sending claims with age or a provider-uncertain status', async () => {
    await emailRpc(db, 'claim')
    await db.exec("RESET ROLE; UPDATE akasha_ai.email_sequence_deliveries SET created_at='2020-01-01'; SET ROLE service_role")
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'reconciliation_required' })
    expect(await emailRpc(db, 'reconcile', { p_provider_email_id: null, p_reason: 'provider_unconfirmed' }))
      .toMatchObject({ status: 'reconciliation_required' })
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'reconciliation_required' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'reconciliation_required' }] })
  })

  it.each([{ p_attempt_token: SECOND_ATTEMPT }, { p_payload_hash: 'b'.repeat(64) }])('rejects a different completion owner %j', async overrides => {
    await emailRpc(db, 'claim')
    await expect(emailRpc(db, 'complete', overrides)).rejects.toMatchObject({ code: '55000' })
    await expect(emailRpc(db, 'reconcile', overrides)).rejects.toMatchObject({ code: '55000' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
  })

  it.each([null, '', ' ', 'id with spaces', 'x'.repeat(256)])('rejects invalid provider id %j', async id => {
    await emailRpc(db, 'claim')
    await expect(emailRpc(db, 'complete', { p_provider_email_id: id })).rejects.toMatchObject({ code: '22023' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
  })

  it('rolls back the final log and retains the claim when log persistence fails', async () => {
    await emailRpc(db, 'claim')
    await db.exec(`RESET ROLE;
      CREATE FUNCTION akasha_ai.email_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'synthetic log write failure'; END $$;
      CREATE TRIGGER email_fixture_failure BEFORE INSERT ON akasha_ai.email_sequences
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.email_fixture_failure(); SET ROLE service_role;`)
    try {
      await expect(emailRpc(db, 'complete')).rejects.toThrow('synthetic log write failure')
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    } finally {
      await db.exec(`RESET ROLE; DROP TRIGGER email_fixture_failure ON akasha_ai.email_sequences;
        DROP FUNCTION akasha_ai.email_fixture_failure(); SET ROLE service_role;`)
    }
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'reconciliation_required' })
    await emailRpc(db, 'reconcile')
    // This is receipt-only recovery with an independently confirmed provider id,
    // not another delivery or a claim takeover.
    expect(await emailRpc(db, 'complete')).toMatchObject({ status: 'sent' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 1, journals: [{ state: 'sent' }] })
  })

  it('never downgrades a completed receipt when its response was lost', async () => {
    await emailRpc(db, 'claim'); await emailRpc(db, 'complete')
    expect(await emailRpc(db, 'reconcile')).toMatchObject({ status: 'sent' })
    await expect(emailRpc(db, 'complete', { p_provider_email_id: 'different-provider-id' })).rejects.toMatchObject({ code: '55000' })
    await expect(emailRpc(db, 'reconcile', { p_provider_email_id: 'different-provider-id' })).rejects.toMatchObject({ code: '55000' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 1, journals: [{ state: 'sent' }] })
  })

  it('does not use one provider acceptance to confirm two different sequences', async () => {
    await emailRpc(db, 'claim'); await emailRpc(db, 'complete')
    await emailRpc(db, 'claim', { p_email_type: 'tip_day1' })
    await expect(emailRpc(db, 'complete', { p_email_type: 'tip_day1' })).rejects.toMatchObject({ code: '23505' })
    expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 1 })
  })

  it('preserves duplicate prevention if an old display log is removed', async () => {
    await emailRpc(db, 'claim'); await emailRpc(db, 'complete')
    await db.exec('RESET ROLE; DELETE FROM akasha_ai.email_sequences; SET ROLE service_role')
    expect(await emailRpc(db, 'claim', { p_attempt_token: SECOND_ATTEMPT })).toMatchObject({ status: 'already_sent' })
  })

  for (const role of ['anon', 'authenticated']) {
    it('denies admission, completion and reconciliation to ' + role, async () => {
      await db.exec('SET ROLE ' + role)
      for (const name of ['claim', 'complete', 'reconcile'] as const) {
        await expect(emailRpc(db, name)).rejects.toMatchObject({ code: '42501' })
      }
    })
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    it('does not allow direct journal edits as ' + role, async () => {
      await emailRpc(db, 'claim')
      await db.exec('SET ROLE ' + role)
      await expect(db.exec('DELETE FROM akasha_ai.email_sequence_deliveries')).rejects.toMatchObject({ code: '42501' })
      await expect(db.exec("UPDATE akasha_ai.email_sequence_deliveries SET state='sending'")).rejects.toMatchObject({ code: '42501' })
    })
  }
})
