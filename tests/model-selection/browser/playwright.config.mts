import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default defineConfig({
  testDir: '.',
  testMatch: 'selection.spec.ts',
  outputDir: process.env.AKASHA_UI_TEST_OUTPUT ?? join(tmpdir(), 'akasha-model-selection-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5187',
    browserName: 'firefox',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/model-selection/browser/vite.config.mts',
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    url: 'http://127.0.0.1:5187/dashboard/chat',
    reuseExistingServer: false,
  },
})
