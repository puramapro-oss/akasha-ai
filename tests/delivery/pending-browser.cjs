'use strict'

// Run from a checkout installed with its lock: node tests/delivery/pending-browser.cjs
// This exercises the exact browser-request.ts helper, not the Next.js application.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { createRequire, stripTypeScriptTypes } = require('node:module')
const { createHash } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const sourceFile = 'src/lib/idempotency/browser-request.ts'
const reportFile = 'evidence/native-pending-browser.json'
const reportPath = path.join(root, reportFile)
const USER = '00000000-0000-4000-8000-000000000001'
const platform = 'whatsapp'
const key = 'akasha-share-pending/v1/' + USER + '/' + platform
const expectedChecks = [
  'second_tab_refused_while_first_lock_held',
  'lost_response_releases_lock_and_reuses_uuid',
  'reload_preserves_pending_uuid',
  'mismatched_receipt_does_not_clear_pending',
  'confirmed_receipt_clears_shared_pending_key',
]
const report = {
  started_at_utc: new Date().toISOString(),
  scope: 'Exact browser-request.ts helper in real Chromium with two same-origin pages; not the Next.js application or a provider/end-to-end test',
  source_file: sourceFile, report_file: reportFile, node_version: process.version,
  checks: [], success: false, blocked_network_requests: [], page_errors: [],
  cleanup: { context: 'not_created', browser: 'not_created', server: 'not_started' },
  errors: [],
}
let browser, context, server

const sha256 = value => createHash('sha256').update(value).digest('hex')
function failure(stage, error) {
  report.errors.push({ stage, message: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
}

async function run() {
  assert.equal(typeof stripTypeScriptTypes, 'function', 'Node with built-in TypeScript stripping is required')
  const requireFromRepo = createRequire(path.join(root, 'package.json'))
  const lockSource = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  const lock = JSON.parse(lockSource)
  const installed = requireFromRepo('playwright/package.json').version
  const locked = lock.packages?.['node_modules/playwright']?.version
  assert.equal(typeof locked, 'string', 'Playwright must exist in the repository lock')
  assert.equal(installed, locked, 'Installed Playwright must match the repository lock')
  report.playwright_version = installed
  report.locked_playwright_version = locked
  report.package_lock_sha256 = sha256(lockSource)
  const { chromium } = requireFromRepo('playwright')
  const source = fs.readFileSync(path.join(root, sourceFile), 'utf8')
  report.source_sha256 = sha256(source)
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
  const bootstrap = 'import * as pending from "/pending.js"; window.pending = pending;'
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pending helper fixture</title></head><body><p>Pending receipt helper fixture</p><script type="module" src="/fixture.js"></script></body></html>'

  server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
    if (request.url === '/pending.js' || request.url === '/fixture.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      response.end(request.url === '/pending.js' ? js : bootstrap)
      return
    }
    if (request.url !== '/') { response.writeHead(404); response.end(); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(html)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  report.cleanup.server = 'open'
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = 'http://127.0.0.1:' + address.port
  report.allowed_origin = origin

  // Use Playwright's matching browser installation, with no executable override
  // or additional Chromium security-disabling flags.
  browser = await chromium.launch({ headless: true })
  report.cleanup.browser = 'open'
  report.browser_version = browser.version()
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  report.cleanup.context = 'open'
  await context.route('**/*', async route => {
    const url = route.request().url()
    if (new URL(url).origin === origin) { await route.continue(); return }
    report.blocked_network_requests.push({ kind: 'http', url })
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', async socket => {
    report.blocked_network_requests.push({ kind: 'websocket', url: socket.url() })
    await socket.close({ code: 1008, reason: 'Only loopback HTTP fixture traffic is allowed' })
  })
  const one = await context.newPage(), two = await context.newPage()
  for (const page of [one, two]) {
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => report.page_errors.push(error.message))
    await page.goto(origin)
    await page.waitForFunction(() => Boolean(window.pending))
  }

  await one.evaluate(({ user, platform }) => {
    window.lockReady = false
    window.lockResult = window.pending.withPendingRequestLock('akasha-share-pending/v1/' + user + '/' + platform, async () => {
      window.pendingId = window.pending.getPendingRequestId('akasha-share-pending/v1/' + user + '/' + platform)
      window.lockReady = true
      await new Promise(resolve => { window.releaseReceiptLock = resolve })
      throw new Error('Synthetic response lost')
    }).then(() => ({ ok: true }), error => ({ ok: false, error: error.message }))
  }, { user: USER, platform })
  await one.waitForFunction(() => window.lockReady)
  const firstId = await one.evaluate(() => window.pendingId)
  assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  const refused = await two.evaluate(async ({ user, platform, key }) => {
    let operationRan = false, timeout
    const started = performance.now()
    try {
      const result = await Promise.race([
        window.pending.withPendingRequestLock('akasha-share-pending/v1/' + user + '/' + platform, async () => {
          operationRan = true
          return window.pending.getPendingRequestId('akasha-share-pending/v1/' + user + '/' + platform)
        }).then(value => ({ ok: true, value }), error => ({ ok: false, error: error.message })),
        new Promise(resolve => { timeout = setTimeout(() => resolve({ timedOut: true }), 2000) }),
      ])
      return { result, operationRan, elapsed_ms: performance.now() - started, pending: localStorage.getItem(key) }
    } finally { clearTimeout(timeout) }
  }, { user: USER, platform, key })
  assert.equal(refused.result.ok, false)
  assert.equal(refused.result.timedOut, undefined)
  assert.match(refused.result.error, /autre onglet/)
  assert.equal(refused.operationRan, false)
  assert.equal(refused.pending, firstId)
  report.checks.push({ name: expectedChecks[0], pass: true, ...refused })

  await one.evaluate(() => window.releaseReceiptLock())
  const lost = await one.evaluate(() => window.lockResult)
  assert.equal(lost.ok, false)
  assert.equal(lost.error, 'Synthetic response lost')
  const retried = await two.evaluate(({ user, platform }) => window.pending.withPendingRequestLock('akasha-share-pending/v1/' + user + '/' + platform,
    async () => window.pending.getPendingRequestId('akasha-share-pending/v1/' + user + '/' + platform)), { user: USER, platform })
  assert.equal(retried, firstId)
  report.checks.push({ name: expectedChecks[1], pass: true, request_id: retried })

  await one.reload()
  await one.waitForFunction(() => Boolean(window.pending))
  const afterReload = await one.evaluate(({ user, platform }) => window.pending.withPendingRequestLock('akasha-share-pending/v1/' + user + '/' + platform,
    async () => window.pending.getPendingRequestId('akasha-share-pending/v1/' + user + '/' + platform)), { user: USER, platform })
  assert.equal(afterReload, firstId)
  report.checks.push({ name: expectedChecks[2], pass: true, request_id: afterReload })

  const wrongConfirmation = await one.evaluate(({ user, platform, key }) => {
    window.pending.clearPendingRequest('akasha-share-pending/v1/' + user + '/' + platform, '99999999-9999-4999-8999-999999999999')
    return localStorage.getItem(key)
  }, { user: USER, platform, key })
  assert.equal(wrongConfirmation, firstId)
  report.checks.push({ name: expectedChecks[3], pass: true })

  const cleared = await two.evaluate(({ user, platform, key, id }) => window.pending.withPendingRequestLock('akasha-share-pending/v1/' + user + '/' + platform, async () => {
    window.pending.clearPendingRequest('akasha-share-pending/v1/' + user + '/' + platform, id)
    return localStorage.getItem(key)
  }), { user: USER, platform, key, id: firstId })
  assert.equal(cleared, null)
  assert.equal(await one.evaluate(key => localStorage.getItem(key), key), null)
  report.checks.push({ name: expectedChecks[4], pass: true })
  assert.deepEqual(report.checks.map(check => check.name), expectedChecks)
  assert.ok(report.checks.every(check => check.pass === true))
  assert.deepEqual(report.blocked_network_requests, [])
  assert.deepEqual(report.page_errors, [])
}

async function cleanup() {
  for (const [name, resource] of [['context', context], ['browser', browser]]) {
    if (!resource) continue
    try { await resource.close(); report.cleanup[name] = 'closed' }
    catch (error) { report.cleanup[name] = 'failed'; failure('cleanup_' + name, error) }
  }
  if (server?.listening) {
    try {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
      report.cleanup.server = 'closed'
    } catch (error) { report.cleanup.server = 'failed'; failure('cleanup_server', error) }
  }
}

async function main() {
  let timer
  try {
    await Promise.race([run(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Helper browser qualification exceeded 45 seconds')), 45_000)
    })])
  } catch (error) { failure('helper_checks', error) }
  finally { clearTimeout(timer); await cleanup() }
  report.completed_at_utc = new Date().toISOString()
  report.success = report.errors.length === 0 && report.checks.length === expectedChecks.length
    && report.checks.every(check => check.pass === true)
    && report.blocked_network_requests.length === 0 && report.page_errors.length === 0
    && Object.values(report.cleanup).every(status => status === 'closed')
  if (!report.success) process.exitCode = 1
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.deepEqual(persisted, report, 'The persisted helper report must match the verified result')
  process.stdout.write(JSON.stringify({ report_file: reportFile, report_verified: true,
    scope: report.scope, success: report.success, checks: report.checks.length,
    source_sha256: report.source_sha256, browser_version: report.browser_version, cleanup: report.cleanup }) + '\n')
}

void main().catch(error => {
  process.exitCode = 1
  process.stderr.write('Unable to complete or persist the helper browser qualification: ' + error.message + '\n')
})
