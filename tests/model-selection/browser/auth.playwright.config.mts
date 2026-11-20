import { defineConfig } from '@playwright/test'
import base from './playwright.config.mts'
export default defineConfig({ ...base, testMatch: 'auth.spec.ts', webServer: {
  ...base.webServer,
  command: 'node node_modules/vite/bin/vite.js --config tests/model-selection/browser/vite.config.mts --mode auth-recovery',
} })
