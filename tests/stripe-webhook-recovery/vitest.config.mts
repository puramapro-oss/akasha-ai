import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  cacheDir: '.git/unlazy-akasha-webhook-probe/vite-cache',
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: {
    include: ['tests/stripe-webhook-recovery/behavior.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 3000,
  },
})
