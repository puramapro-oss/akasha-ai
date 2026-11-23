import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: {
    environment: 'node', include: ['tests/contact/native-idempotency.test.ts'],
    maxWorkers: 1, fileParallelism: false, testTimeout: 15_000, hookTimeout: 15_000,
  },
})
