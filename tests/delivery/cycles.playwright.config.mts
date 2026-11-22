import assert from 'node:assert/strict'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

function loopbackOrigin(value: string | undefined) {
  assert.ok(value, 'The owned Cycles runner must provide the local origin')
  const url = new URL(value)
  assert.equal(url.protocol, 'http:')
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(url.port)
  assert.equal(value, url.origin, 'Only an exact loopback origin is accepted')
  return value
}

const baseURL = loopbackOrigin(process.env.CYCLES_E2E_BASE_URL)
const proxy = loopbackOrigin(process.env.AKASHA_CYCLES_DENY_PROXY)
const output = process.env.AKASHA_CYCLES_OUTPUT
assert.ok(output && path.isAbsolute(output), 'A dedicated absolute results directory is required')

// Self-contained: the historical configuration and its production URL are not imported.
export default defineConfig({
  testDir: '..',
  testMatch: 'cycles-public.spec.ts',
  outputDir: path.join(output, 'browser-output'),
  forbidOnly: true,
  timeout: 30_000,
  globalTimeout: 150_000,
  workers: 1,
  retries: 0,
  reporter: [['json', { outputFile: path.join(output, 'playwright.json') }]],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { proxy: { server: proxy, bypass: '127.0.0.1' } },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
