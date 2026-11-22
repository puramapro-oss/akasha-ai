import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { emailDatabase, emailRpc, USER, RECIPIENT } from '../../tests/email-sequences/sql-fixture'

let db: PGlite
let originalHistory: unknown[]
beforeAll(async () => {
  db = await emailDatabase({ incoming: true, beforeDelivery: async database => {
    await database.query('INSERT INTO auth.users(id) VALUES($1)', [USER])
    await database.query('INSERT INTO akasha_ai.profiles(id,email) VALUES($1,$2)', [USER, RECIPIENT])
    await database.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [USER])
    await database.exec('SET ROLE service_role')
    const old = await database.query<{ recorded: boolean }>(
      "SELECT akasha_ai.record_email_sequence_delivery($1,'welcome') AS recorded", [USER])
    expect(old.rows[0].recorded).toBe(true)
    originalHistory = (await database.query('SELECT * FROM akasha_ai.email_sequences WHERE user_id=$1', [USER])).rows
    await database.exec('RESET ROLE')
  } })
}, 20_000)
afterAll(async () => { await db?.close() })

async function actor() {
  await db.exec('RESET ROLE')
  const id = randomUUID()
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [id])
  await db.query('INSERT INTO akasha_ai.profiles(id,email) VALUES($1,$2)', [id, RECIPIENT])
  await db.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [id])
  await db.exec('SET ROLE service_role')
  return id
}

describe('the incoming migration and durable email migration have one active writer', () => {
  it.each(['anon', 'authenticated', 'service_role'])('retires the old recorder from %s', async role => {
    await db.exec('SET ROLE ' + role)
    await expect(db.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [USER]))
      .rejects.toMatchObject({ code: '42501' })
  })

  it('preserves incoming history byte for byte without claiming provider confirmation', async () => {
    await db.exec('SET ROLE service_role')
    expect((await db.query('SELECT * FROM akasha_ai.email_sequences WHERE user_id=$1', [USER])).rows).toEqual(originalHistory)
    expect(await emailRpc(db, 'claim')).toMatchObject({ status: 'reconciliation_required' })
    await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
    expect((await db.query('SELECT * FROM akasha_ai.email_sequences WHERE user_id=$1', [USER])).rows).toEqual(originalHistory)
  })

  it('keeps authenticated history readable only for its owner and denies direct writes', async () => {
    await db.exec('SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [USER])
    expect((await db.query('SELECT * FROM akasha_ai.email_sequences')).rows).toEqual(originalHistory)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [randomUUID()])
    expect((await db.query('SELECT * FROM akasha_ai.email_sequences')).rows).toEqual([])
    await expect(db.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome')", [USER]))
      .rejects.toMatchObject({ code: '42501' })
    await expect(db.query("UPDATE akasha_ai.email_sequences SET opened=true WHERE user_id=$1", [USER]))
      .rejects.toMatchObject({ code: '42501' })
    await expect(db.query('DELETE FROM akasha_ai.email_sequences WHERE user_id=$1', [USER]))
      .rejects.toMatchObject({ code: '42501' })
  })

  it('lets the service complete the new durable receipt despite the incoming table restrictions', async () => {
    const id = await actor()
    expect(await emailRpc(db, 'claim', { p_user_id: id })).toMatchObject({ status: 'claimed' })
    expect(await emailRpc(db, 'complete', { p_user_id: id })).toMatchObject({ status: 'sent' })
    expect(await emailRpc(db, 'claim', { p_user_id: id })).toMatchObject({ status: 'already_sent' })
    expect((await db.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequences WHERE user_id=$1', [id])).rows[0])
      .toEqual({ count: 1 })
  })

  it.each(['notification_preferences', 'email_sequences'])(
    'never admits a send when the %s read fails inside the SQL authority', async table => {
      const id = await actor()
      await db.exec('RESET ROLE; BEGIN; DROP TABLE akasha_ai.' + table + '; SET LOCAL ROLE service_role')
      try { await expect(emailRpc(db, 'claim', { p_user_id: id })).rejects.toMatchObject({ code: '42P01' }) }
      finally { await db.exec('ROLLBACK; SET ROLE service_role') }
      expect((await db.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequence_deliveries WHERE user_id=$1', [id])).rows[0])
        .toEqual({ count: 0 })
    },
  )
})
