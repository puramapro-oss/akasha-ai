import { Socket } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import type { PGlite } from '@electric-sql/pglite'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailDatabase } from '../../../../tests/email-sequences/sql-fixture'

const doubles = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('@/lib/rate-limit', () => ({ ratelimitContact: { limit: async () => ({ success: true }) } }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))
const BODY = { name: 'Synthetic person', email: 'contact@example.invalid', subject: 'Synthetic subject', message: 'No real contact.' }
let db: PGlite
let writes: number
let reads: number

beforeAll(async () => { db = await emailDatabase({ incoming: true }) }, 20_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  vi.clearAllMocks(); writes = 0; reads = 0
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_only')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network disabled') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-provider-id' }, error: null })
  await db.exec(`RESET ROLE; DROP TRIGGER IF EXISTS contact_mutation ON akasha_ai.contact_messages;
    TRUNCATE akasha_ai.contact_messages; SET ROLE service_role;`)
  const transport: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    if (url.origin !== 'https://contact.synthetic.invalid' || url.pathname !== '/rest/v1/contact_messages') {
      throw new Error('Unexpected database operation')
    }
    try {
      if (options?.method === 'POST') {
        writes++
        const data = JSON.parse(String(options.body))
        const result = await db.query(`INSERT INTO akasha_ai.contact_messages(name,email,subject,message)
          VALUES($1,$2,$3,$4) RETURNING id,name,email,subject,message`, [data.name, data.email, data.subject, data.message])
        return Response.json(result.rows[0] ?? null, { status: 201 })
      }
      if (options?.method !== 'GET') throw new Error('Unexpected database method')
      reads++
      const result = await db.query('SELECT id,name,email,subject,message FROM akasha_ai.contact_messages WHERE id=$1',
        [url.searchParams.get('id')?.replace(/^eq\./, '')])
      return Response.json(result.rows[0] ?? null)
    } catch (error) { return Response.json({ message: String(error), code: 'XX000' }, { status: 500 }) }
  }
  doubles.client.mockReturnValue(createClient('https://contact.synthetic.invalid', 'synthetic-key', {
    db: { schema: 'akasha_ai' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }))
})
afterEach(() => {
  try { expect(globalThis.fetch).not.toHaveBeenCalled(); expect(Socket.prototype.connect).not.toHaveBeenCalled() }
  finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})

const run = async () => (await import('./route')).POST(new NextRequest('https://app.synthetic.invalid/api/contact', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(BODY),
}))
async function trigger(timing: 'BEFORE' | 'AFTER', body: string) {
  await db.exec(`RESET ROLE;
    CREATE OR REPLACE FUNCTION akasha_ai.mutate_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} END $$;
    CREATE TRIGGER contact_mutation ${timing} INSERT ON akasha_ai.contact_messages FOR EACH ROW EXECUTE FUNCTION akasha_ai.mutate_contact();
    SET ROLE service_role;`)
}

describe('contact acknowledgement observes the actual schema and committed trigger effects', () => {
  it('confirms matching persisted content before either provider operation', async () => {
    doubles.send.mockImplementation(async () => {
      expect(reads).toBe(1)
      expect((await db.query('SELECT name,email,subject,message FROM akasha_ai.contact_messages')).rows).toEqual([BODY])
      return { data: { id: 'synthetic-provider-id' }, error: null }
    })
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, emails: { team: 'accepted', confirmation: 'accepted' } })
    expect(writes).toBe(1); expect(reads).toBe(1); expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it.each(['name', 'email', 'subject', 'message'])('refuses a BEFORE rewrite of %s', async field => {
    await trigger('BEFORE', `NEW.${field} := 'rewritten@example.invalid'; RETURN NEW;`)
    expect((await run()).status).toBe(503)
    expect(reads).toBe(0); expect(doubles.send).not.toHaveBeenCalled()
  })

  it.each(['name', 'email', 'subject', 'message'])('refuses an AFTER rewrite of %s despite its valid insert receipt', async field => {
    await trigger('AFTER', `UPDATE akasha_ai.contact_messages SET ${field}='rewritten@example.invalid' WHERE id=NEW.id; RETURN NEW;`)
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ stored: 'unconfirmed' })
    expect(reads).toBe(1); expect(doubles.send).not.toHaveBeenCalled()
  })

  it.each([
    ['BEFORE', 'RETURN NULL;', 0],
    ['AFTER', 'DELETE FROM akasha_ai.contact_messages WHERE id=NEW.id; RETURN NEW;', 1],
  ] as const)('refuses a %s suppression without a false success', async (timing, body, expectedReads) => {
    await trigger(timing, body)
    expect((await run()).status).toBe(503)
    expect((await db.query('SELECT * FROM akasha_ai.contact_messages')).rows).toEqual([])
    expect(reads).toBe(expectedReads); expect(doubles.send).not.toHaveBeenCalled()
  })
})
