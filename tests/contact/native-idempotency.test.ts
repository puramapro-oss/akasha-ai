import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: doubles.client }))
vi.mock('@/lib/rate-limit', () => ({ ratelimitContact: { limit: async () => ({ success: true }) } }))
vi.mock('resend', () => ({ Resend: class { emails = { send: doubles.send } } }))

const { POST } = await import('../../src/app/api/contact/route')
const body = { name: 'Synthetic person', email: 'contact@example.invalid', subject: 'Synthetic subject', message: 'No real contact.' }
const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
const sourceFile = resolve('src/app/api/contact/route.ts')
const sourceHash = () => createHash('sha256').update(readFileSync(sourceFile)).digest('hex')
const initialSource = sourceHash()
const connectionString = process.env.AKASHA_CONTACT_TEST_DB_URL
assert.ok(connectionString, 'Run through native-idempotency.py with an owned disposable PostgreSQL cluster')
const url = new URL(connectionString)
assert.equal(url.hostname, '127.0.0.1')
assert.equal(url.pathname, '/akasha_contact_idempotency_test')
const marker = JSON.parse(readFileSync(process.env.AKASHA_CONTACT_TEST_MARKER!, 'utf8'))
assert.equal(marker.kind, 'akasha-contact-owned-synthetic')
assert.equal(marker.port, Number(url.port))
const config = { connectionString, application_name: 'akasha-contact-idempotency-qa',
  connectionTimeoutMillis: 2_000, statement_timeout: 5_000, query_timeout: 7_000 }
const admin = new pg.Client(config)
const openClients = new Set<pg.Client>()
const observations: Record<string, unknown>[] = []
let owned = false
let writes = 0
let reads = 0
let inserted = 0
let loseInsertAck = false
let hideReadReceipt = false
type Barrier = { key: string; ownerPid?: number; competitorPid?: number;
  inserted: ReturnType<typeof Promise.withResolvers<void>>;
  competitor: ReturnType<typeof Promise.withResolvers<void>>;
  release: ReturnType<typeof Promise.withResolvers<void>> }
let barrier: Barrier | undefined

async function serviceClient() {
  const client = new pg.Client(config)
  openClients.add(client)
  try { await client.connect(); await client.query('SET ROLE service_role'); return client }
  catch (error) { await client.end(); openClients.delete(client); throw error }
}

const transport: typeof fetch = async (input, init) => {
  const target = new URL(String(input))
  assert.equal(target.origin, 'https://contact.synthetic.invalid')
  assert.equal(target.pathname, '/rest/v1/contact_messages')
  assert.equal(target.searchParams.get('select'), 'id,name,email,subject,message')
  const client = await serviceClient()
  try {
    if (init?.method === 'POST') {
      writes++
      const data = JSON.parse(String(init.body))
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid
      if (barrier && barrier.key === data.id && barrier.ownerPid !== undefined) {
        barrier.competitorPid = pid
        barrier.competitor.resolve()
      }
      await client.query('BEGIN')
      const result = await client.query(`INSERT INTO akasha_ai.contact_messages(id,name,email,subject,message)
        VALUES($1::uuid,$2,$3,$4,$5) RETURNING id,name,email,subject,message`,
      [data.id, data.name, data.email, data.subject, data.message])
      inserted++
      if (barrier && barrier.key === data.id && barrier.ownerPid === undefined) {
        barrier.ownerPid = pid
        barrier.inserted.resolve()
        await barrier.release.promise
      }
      await client.query('COMMIT')
      if (loseInsertAck) { loseInsertAck = false; throw new Error('Synthetic lost insert response after COMMIT') }
      return Response.json(result.rows[0], { status: 201 })
    }
    assert.equal(init?.method, 'GET')
    reads++
    const result = await client.query('SELECT id,name,email,subject,message FROM akasha_ai.contact_messages WHERE id=$1::uuid',
      [target.searchParams.get('id')?.replace(/^eq\./, '')])
    return Response.json(hideReadReceipt ? null : result.rows[0] ?? null)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'XX000'
    return Response.json({ message: 'Synthetic SQL outcome unavailable', code }, { status: code === '23505' ? 409 : 503 })
  } finally { await client.end(); openClients.delete(client) }
}

const request = (key = id, payload = body) => POST(new NextRequest('https://app.synthetic.invalid/api/contact', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload),
}))

async function rows() { return (await admin.query('SELECT id,name,email,subject,message FROM akasha_ai.contact_messages ORDER BY id')).rows }

async function witnessBlocking(waiter: number, blocker: number) {
  assert.notEqual(waiter, blocker)
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await admin.query('SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1', [waiter])
    if (result.rows[0]?.wait_event_type === 'Lock' && result.rows[0].blockers.includes(blocker)) {
      observations.push({ waiter, blocker, ...result.rows[0] }); return
    }
    await delay(5)
  }
  throw new Error('Independent backend was not observed waiting for its concurrent insert owner')
}

async function concurrent(payload = body) {
  barrier = { key: id, inserted: Promise.withResolvers<void>(), competitor: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  const first = request()
  let second: Promise<Response> | undefined
  try {
    await barrier.inserted.promise
    second = request(id, payload)
    await barrier.competitor.promise
    await witnessBlocking(barrier.competitorPid!, barrier.ownerPid!)
  } finally { barrier.release.resolve() }
  assert.ok(second)
  return Promise.all([first, second])
}

beforeAll(async () => {
  await admin.connect()
  const identity = (await admin.query("SELECT current_setting('data_directory') AS cluster, to_regnamespace('akasha_ai') AS existing")).rows[0]
  assert.equal(identity.cluster, marker.cluster)
  assert.equal(identity.existing, null, 'requires a new disposable database')
  await admin.query('CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA akasha_ai; GRANT USAGE ON SCHEMA akasha_ai TO service_role')
  owned = true
  const schema = readFileSync('schema.sql', 'utf8')
  const table = schema.match(/CREATE TABLE IF NOT EXISTS akasha_ai\.contact_messages \([\s\S]+?\n\);/)
  assert.ok(table)
  await admin.query(table[0])
  await admin.query('ALTER TABLE akasha_ai.contact_messages ENABLE ROW LEVEL SECURITY')
  const migration = readFileSync('supabase/migrations/20261122165000_delivery_consistency.sql', 'utf8')
  const grant = migration.match(/GRANT SELECT, INSERT ON akasha_ai\.contact_messages TO service_role;/)
  assert.ok(grant)
  await admin.query(grant[0])
})

beforeEach(async () => {
  vi.clearAllMocks(); writes = 0; reads = 0; inserted = 0
  loseInsertAck = false; hideReadReceipt = false; barrier = undefined
  await admin.query('TRUNCATE akasha_ai.contact_messages')
  vi.stubEnv('RESEND_API_KEY', 're_synthetic_only')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real HTTP is disabled') }))
  doubles.send.mockResolvedValue({ data: { id: 'synthetic-provider-id' }, error: null })
  doubles.client.mockReturnValue(createClient('https://contact.synthetic.invalid', 'synthetic-key', {
    db: { schema: 'akasha_ai' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }))
})

afterEach(() => {
  try { expect(globalThis.fetch).not.toHaveBeenCalled(); expect(openClients.size).toBe(0) }
  finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})

afterAll(async () => {
  try {
    const finalSource = sourceHash()
    writeFileSync(process.env.AKASHA_CONTACT_TEST_OBSERVATIONS!, JSON.stringify({
      source_sha256_before: initialSource, source_sha256_after: finalSource, source_unchanged: finalSource === initialSource,
      lock_observations: observations, scope: 'Real POST and Supabase SDK; native PostgreSQL transport; synthetic rate-limit and email provider',
    }, null, 2) + '\n')
    expect(finalSource).toBe(initialSource)
    if (owned) await admin.query('DROP SCHEMA akasha_ai CASCADE')
  } finally {
    await Promise.allSettled([...openClients].map(client => client.end()))
    await admin.end()
  }
})

describe('native contact idempotency through the real route and Supabase SDK', () => {
  it('inserts and acknowledges once with only SELECT and INSERT privileges', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, message_id: id })
    expect(await rows()).toEqual([{ id, ...body }])
    expect(inserted).toBe(1); expect(writes).toBe(1); expect(reads).toBe(1)
    expect(doubles.send).toHaveBeenCalledTimes(2)
    const grants = (await admin.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='akasha_ai' AND table_name='contact_messages' AND grantee='service_role' ORDER BY privilege_type")).rows
    expect(grants.map(row => row.privilege_type)).toEqual(['INSERT', 'SELECT'])
  })

  it('waits for the concurrent owner and sends exactly one pair of notifications', async () => {
    const responses = await concurrent()
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const receipts = await Promise.all(responses.map(response => response.json()))
    expect(receipts.map(receipt => receipt.message_id)).toEqual([id, id])
    expect(receipts[1].emails).toEqual({ team: 'unconfirmed', confirmation: 'unconfirmed' })
    expect(await rows()).toEqual([{ id, ...body }])
    expect(inserted).toBe(1); expect(writes).toBe(2); expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('never overwrites the concurrent winner with different content', async () => {
    const responses = await concurrent({ ...body, message: 'Different synthetic content' })
    expect(responses.map(response => response.status)).toEqual([200, 503])
    expect(await rows()).toEqual([{ id, ...body }])
    expect(inserted).toBe(1); expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('reconciles an insert response lost after real COMMIT without notifying', async () => {
    loseInsertAck = true
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, message_id: id, emails: { team: 'unconfirmed', confirmation: 'unconfirmed' } })
    expect(await rows()).toEqual([{ id, ...body }]); expect(inserted).toBe(1)
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it('recovers the same row after both insert and read receipts were unavailable', async () => {
    loseInsertAck = true; hideReadReceipt = true
    expect((await request()).status).toBe(503)
    hideReadReceipt = false
    expect((await request()).status).toBe(200)
    expect(await rows()).toEqual([{ id, ...body }]); expect(inserted).toBe(1); expect(writes).toBe(2)
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it('recovers after a lost browser response without repeating notifications', async () => {
    await request() // Deliberately discard the first HTTP response.
    const response = await request()
    expect(response.status).toBe(200)
    expect((await response.json()).message_id).toBe(id)
    expect(await rows()).toEqual([{ id, ...body }]); expect(inserted).toBe(1)
    expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('canonicalizes uppercase UUIDs to the original persisted operation', async () => {
    const first = await request(id.toUpperCase())
    expect(first.status).toBe(200)
    expect((await first.json()).message_id).toBe(id)
    expect((await request()).status).toBe(200)
    expect(await rows()).toEqual([{ id, ...body }]); expect(inserted).toBe(1)
    expect(doubles.send).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid identifiers before every database or provider operation', async () => {
    expect((await request('invalid-id')).status).toBe(400)
    expect(await rows()).toEqual([]); expect(writes).toBe(0); expect(reads).toBe(0)
    expect(doubles.send).not.toHaveBeenCalled()
  })

  it('does not deduplicate genuinely different concurrent operation identifiers', async () => {
    const ids = Array.from({ length: 4 }, (_, index) => `abcdefab-cdef-4abc-8def-abcdefabcde${index}`)
    const responses = await Promise.all(ids.map(key => request(key)))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200])
    expect((await rows()).map(row => row.id)).toEqual(ids)
    expect(inserted).toBe(4); expect(doubles.send).toHaveBeenCalledTimes(8)
  })

  it('cannot update or delete a contact through the minimally privileged service role', async () => {
    await request()
    const client = await serviceClient()
    try {
      await expect(client.query('UPDATE akasha_ai.contact_messages SET message=$1 WHERE id=$2', ['overwrite', id])).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('DELETE FROM akasha_ai.contact_messages WHERE id=$1', [id])).rejects.toMatchObject({ code: '42501' })
    } finally { await client.end(); openClients.delete(client) }
    expect(await rows()).toEqual([{ id, ...body }])
  })
})
