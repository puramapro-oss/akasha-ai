import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { emailDatabase, emailRpc, inspectEmailDatabase, resetEmailDatabase } from '../../../tests/email-sequences/sql-fixture'

let db: PGlite
beforeAll(async () => { db = await emailDatabase() }, 20_000)
beforeEach(async () => { await resetEmailDatabase(db) })
afterAll(async () => { await db?.close() })

async function alteredWrite(table: 'email_sequences' | 'email_sequence_deliveries', timing: 'BEFORE INSERT' | 'AFTER INSERT' | 'BEFORE UPDATE' | 'AFTER UPDATE', body: string, action: () => Promise<void>) {
  await db.exec(`RESET ROLE;
    CREATE FUNCTION akasha_ai.email_fixture_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN ${body} END $$;
    CREATE TRIGGER email_fixture_rewrite ${timing} ON akasha_ai.${table}
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.email_fixture_rewrite(); SET ROLE service_role;`)
  try { await action() }
  finally {
    await db.exec(`RESET ROLE; DROP TRIGGER email_fixture_rewrite ON akasha_ai.${table};
      DROP FUNCTION akasha_ai.email_fixture_rewrite(); SET ROLE service_role;`)
  }
}

describe('SQL confirmations require the rows actually persisted, including trigger effects', () => {
  it('does not confirm a send when a trigger silently suppresses the display-log insert', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequences', 'BEFORE INSERT', 'RETURN NULL;', async () => {
      await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })

  it('rolls back the log when a trigger preserves the old journal state during completion', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequence_deliveries', 'BEFORE UPDATE', `
      NEW.state := OLD.state; NEW.provider_email_id := OLD.provider_email_id;
      NEW.accepted_at := OLD.accepted_at; RETURN NEW;`, async () => {
      await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })

  for (const [field, value] of [
    ['attempt_token', "'44444444-4444-4444-8444-444444444444'::uuid"],
    ['payload_hash', "repeat('b',64)"],
  ]) {
    it('does not authorize provider sending when the stored ' + field + ' was rewritten', async () => {
      await alteredWrite('email_sequence_deliveries', 'BEFORE INSERT', `NEW.${field} := ${value}; RETURN NEW;`, async () => {
        await expect(emailRpc(db, 'claim')).rejects.toMatchObject({ code: '55000' })
        expect(await inspectEmailDatabase(db)).toEqual({ logs: 0, journals: [] })
      })
    })
  }

  it('rolls back a log written for a different sequence by a trigger', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequences', 'BEFORE INSERT', "NEW.email_type := 'tip_day1'; RETURN NEW;", async () => {
      await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })

  it('requires the log to remain present after an AFTER INSERT trigger', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequences', 'AFTER INSERT',
      'DELETE FROM akasha_ai.email_sequences WHERE id=NEW.id; RETURN NEW;', async () => {
        await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
        expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
      })
  })

  it('requires the final journal state after an AFTER UPDATE trigger', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequence_deliveries', 'AFTER UPDATE', `
      IF pg_trigger_depth() = 1 THEN
        UPDATE akasha_ai.email_sequence_deliveries SET state='sending',provider_email_id=NULL,accepted_at=NULL
          WHERE user_id=NEW.user_id AND email_type=NEW.email_type;
      END IF; RETURN NEW;`, async () => {
      await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })

  it('does not claim that an ignored reconciliation update was recorded', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequence_deliveries', 'BEFORE UPDATE', 'RETURN NULL;', async () => {
      await expect(emailRpc(db, 'reconcile')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })

  it('requires the display log after the final journal-write triggers have finished', async () => {
    await emailRpc(db, 'claim')
    await alteredWrite('email_sequence_deliveries', 'AFTER UPDATE', `
      DELETE FROM akasha_ai.email_sequences WHERE user_id=NEW.user_id AND email_type=NEW.email_type;
      RETURN NEW;`, async () => {
      await expect(emailRpc(db, 'complete')).rejects.toMatchObject({ code: '55000' })
      expect(await inspectEmailDatabase(db)).toMatchObject({ logs: 0, journals: [{ state: 'sending' }] })
    })
  })
})
