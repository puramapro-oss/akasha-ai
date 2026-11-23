import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const base = process.env.CONTACT_BROWSER_BASE_URL ?? 'http://127.0.0.1:3057'
const output = process.env.CONTACT_BROWSER_EVIDENCE ?? 'tests/contact/evidence/browser.json'
const origin = new URL(base).origin
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Contact browser tests require a loopback application')
const browser = await chromium.launch({
  headless: true, chromiumSandbox: true,
  ...(process.env.CONTACT_BROWSER_EXECUTABLE ? { executablePath: process.env.CONTACT_BROWSER_EXECUTABLE } : {}),
  ...(process.env.CONTACT_BROWSER_DENY_PROXY ? { proxy: { server: process.env.CONTACT_BROWSER_DENY_PROXY, bypass: '127.0.0.1,localhost' } } : {}),
})
const results = []
const body = { name: 'Synthetic contact', email: 'browser@example.invalid', subject: 'Synthetic subject', message: 'No real message or email.' }
async function fill(page) {
  await page.goto(base + '/contact')
  for (const [id, value] of Object.entries(body)) await page.locator('#' + id).fill(value)
}
async function submit(page) { await page.getByRole('button', { name: /^(Envoyer|Vérifier et terminer cet envoi)$/ }).click() }
async function scenario(name, exercise) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const calls = [], errors = [], external = []
  let mode = 'lost'
  let release
  context.on('page', page => page.on('pageerror', error => errors.push(String(error))))
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) { external.push(url.origin); await route.abort(); return }
    if (url.pathname !== '/api/contact') { await route.continue(); return }
    assert.equal(request.method(), 'POST')
    const id = request.headers()['idempotency-key']
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
    assert.deepEqual(request.postDataJSON(), body)
    calls.push(id)
    const action = mode
    if (action === 'lost') { await route.abort('connectionreset'); return }
    if (action === 'held') await new Promise(resolve => { release = resolve })
    if (action === 'refused') {
      await route.fulfill({ status: 429, json: { success: false, stored: false, error: 'Synthetic rate limit' } })
      return
    }
    await route.fulfill({ status: 200, json: { success: true, stored: true, message_id: id,
      emails: { team: 'unconfirmed', confirmation: 'unconfirmed' } } })
  })
  try {
    await exercise({ context, calls, mode: value => { mode = value }, release: () => release?.() })
    assert.deepEqual(errors, [])
    results.push({ name, status: 'PASS', requests: calls.length, distinct_operations: new Set(calls).size, external_requests_blocked: [...new Set(external)] })
  } catch (error) {
    results.push({ name, status: 'FAIL', error: String(error), requests: calls.length, distinct_operations: new Set(calls).size })
  } finally { release?.(); await context.close() }
}
try {
  await scenario('Lost response, explicit retry and explicit new message', async ({ context, calls, mode }) => {
    const page = await context.newPage(); await fill(page); await submit(page)
    await expect(page.getByRole('alert')).toContainText('peut avoir été enregistré')
    for (const id of Object.keys(body)) await expect(page.locator('#' + id)).toBeDisabled()
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
    assert(!JSON.stringify(storage).includes(body.email)); assert(!JSON.stringify(storage).includes(body.message))
    mode('ok'); await submit(page)
    await expect(page.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    assert.equal(calls.length, 2); assert.equal(calls[0], calls[1])
    await page.getByRole('button', { name: 'Écrire un autre message' }).click()
    for (const [id, value] of Object.entries(body)) await page.locator('#' + id).fill(value)
    await submit(page)
    await expect(page.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    assert.equal(calls.length, 3); assert.notEqual(calls[0], calls[2])
  })
  await scenario('Other tab confirms, original tab reloads and reconciles its own intention', async ({ context, calls, mode }) => {
    const a = await context.newPage(), b = await context.newPage()
    await fill(a); await fill(b); await submit(a)
    await expect(a.getByRole('alert')).toContainText('peut avoir été enregistré')
    mode('ok'); await submit(b)
    await expect(b.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    await fill(a); await submit(a)
    await expect(a.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    assert.equal(calls.length, 3); assert.equal(new Set(calls).size, 1)
  })
  await scenario('Refused retry preserves previous uncertainty and unchanged body', async ({ context, calls, mode }) => {
    const page = await context.newPage(); await fill(page); await submit(page)
    await expect(page.getByRole('alert')).toContainText('peut avoir été enregistré')
    mode('refused'); await submit(page)
    await expect(page.getByRole('alert')).toContainText('Synthetic rate limit')
    await expect(page.getByRole('alert')).toContainText('peut avoir été enregistré')
    for (const id of Object.keys(body)) await expect(page.locator('#' + id)).toBeDisabled()
    mode('ok'); await submit(page)
    await expect(page.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    assert.equal(calls.length, 3); assert.equal(new Set(calls).size, 1)
  })
  await scenario('Reload during another tab lock retains the pending operation', async ({ context, calls, mode, release }) => {
    const a = await context.newPage(), b = await context.newPage()
    await fill(a); await fill(b); await submit(a)
    await expect(a.getByRole('alert')).toContainText('peut avoir été enregistré')
    mode('held'); await submit(b); await expect.poll(() => calls.length).toBe(2)
    await fill(a); await submit(a)
    await expect(a.getByRole('alert')).toContainText('peut avoir été enregistré')
    await expect(a.locator('#message')).toBeDisabled()
    assert.equal(calls.length, 2)
    release(); await expect(b.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    mode('ok'); await submit(a)
    await expect(a.getByRole('status').filter({ hasText: 'Ton message est enregistré' })).toBeVisible()
    assert.equal(calls.length, 3); assert.equal(new Set(calls).size, 1)
  })
} finally {
  const receipt = { status: results.every(result => result.status === 'PASS') && results.length === 4 ? 'PASS' : 'FAIL',
    browser: await browser.version(), sandbox: true, application: 'Compiled Next contact page',
    boundaries: 'Contact API responses simulated in browser; actual route and PostgreSQL tested separately. No real email.', results }
  await browser.close()
  const { dirname } = await import('node:path')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n')
  process.stdout.write(JSON.stringify(receipt) + '\n')
  if (receipt.status !== 'PASS') process.exitCode = 1
}
