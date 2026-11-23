import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const sourceUrl = new URL('../../src/lib/share/open-destination.ts', import.meta.url)
const source = readFileSync(sourceUrl, 'utf8')
const digest = text => createHash('sha256').update(text).digest('hex')
const helper = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace('export function', 'function')
const origin = 'https://synthetic-app.example.invalid'
const destination = 'https://synthetic-share.example.invalid/target'
const result = { status: 'NON TESTÉ', started_at_utc: new Date().toISOString(),
  source_file: 'src/lib/share/open-destination.ts', source_sha256: digest(source),
  node_version: process.version, browser: null, cases: [], routed: [], failures: [], provider_network_calls: 0 }
let browser
try {
  const executablePath = process.env.SHARE_BROWSER_EXECUTABLE
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true,
    ignoreDefaultArgs: ['--disable-popup-blocking'] })
  result.browser = await browser.version()
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(10_000)
  await context.route('**/*', async route => {
    const request = route.request(), url = request.url()
    result.routed.push({ url, referer: request.headers()['referer'] ?? null })
    if (url === origin + '/') return route.fulfill({ contentType: 'text/html', body: `<link rel="icon" href="data:,"><button id="share">Share</button>
      <script>${helper};document.querySelector('#share').onclick=()=>{window.openResult=openShareDestination('${destination}')};</script>` })
    if (url === destination) return route.fulfill({ contentType: 'text/html', body: '<link rel="icon" href="data:,"><h1>Synthetic share target</h1>' })
    result.failures.push('Unexpected request blocked: ' + url)
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  await page.goto(origin)
  const popupReady = context.waitForEvent('page')
  await page.locator('#share').click()
  const popup = await popupReady
  await popup.waitForURL(destination)
  assert.equal(await page.evaluate(() => window.openResult), true)
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.equal(await popup.evaluate(() => document.referrer), '')
  assert.equal(result.routed.find(row => row.url === destination)?.referer, null)
  result.cases.push({ name: 'real user gesture opens a popup with no opener or Referer', status: 'PASS' })
  await popup.close()
  await page.evaluate(() => {
    window.popupAttempts = 0
    window.open = () => { window.popupAttempts += 1; return null }
  })
  await page.locator('#share').click()
  assert.equal(await page.evaluate(() => window.openResult), false)
  assert.equal(context.pages().length, 1)
  assert.equal(await page.evaluate(() => window.popupAttempts), 1)
  result.cases.push({ name: 'denied creation returns false and does not navigate', status: 'PASS', browser_open_return: 'synthetic null' })
  assert.equal(await page.evaluate(() => openShareDestination('javascript:alert(1)')), false)
  assert.equal(await page.evaluate(() => window.popupAttempts), 1, 'Rejected protocol must not attempt another window')
  result.cases.push({ name: 'untrusted navigation protocol rejected', status: 'PASS' })
  assert.deepEqual(result.failures, [])
  result.status = 'PASS'
  await context.close()
} catch (error) {
  result.status = 'FAIL'
  result.failures.push(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (browser) {
    try { await browser.close(); result.browser_closed = true }
    catch (error) {
      result.status = 'FAIL'
      result.failures.push('Browser cleanup: ' + (error instanceof Error ? error.message : String(error)))
      process.exitCode = 1
    }
  }
  result.source_unchanged = digest(readFileSync(sourceUrl, 'utf8')) === result.source_sha256
  if (!result.source_unchanged) {
    result.status = 'FAIL'
    result.failures.push('Executed share helper source changed during qualification')
    process.exitCode = 1
  }
  result.completed_at_utc = new Date().toISOString()
  mkdirSync(new URL('./evidence/', import.meta.url), { recursive: true })
  writeFileSync(new URL('./evidence/popup-browser.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
  process.stdout.write(JSON.stringify(result) + '\n')
}
