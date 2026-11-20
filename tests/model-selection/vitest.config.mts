import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      '@purama/smarana': fileURLToPath(new URL('./fakes/smarana.ts', import.meta.url)),
      'server-only': fileURLToPath(new URL('./fakes/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/model-selection/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
  },
})
