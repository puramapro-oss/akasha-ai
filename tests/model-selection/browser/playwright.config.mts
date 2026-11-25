import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default defineConfig({
  testDir: '.',
  testMatch: ['selection.spec.ts', 'spiritual-session.spec.ts', 'natal-session.spec.ts', 'rishi-numerology.spec.ts'],
  outputDir: process.env.AKASHA_UI_TEST_OUTPUT ?? join(tmpdir(), 'akasha-model-selection-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:51066',
    browserName: 'chromium',
    headless: true,
    launchOptions: { executablePath: process.env.AKASHA_CHROMIUM_PATH ?? (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/model-selection/browser/vite.config.mts',
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    url: 'http://127.0.0.1:51066/dashboard/chat',
    reuseExistingServer: false,
  },
})
