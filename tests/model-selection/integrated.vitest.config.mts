import { mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import base from '../../vitest.config.ts';
export default mergeConfig(base, {
  cacheDir: './.qa-cache',
  resolve: { alias: {
    '@purama/smarana': fileURLToPath(new URL('./fakes/smarana.ts', import.meta.url)),
    'server-only': fileURLToPath(new URL('./fakes/server-only.ts', import.meta.url)),
  } },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/model-selection/*.test.ts', 'tests/stripe-webhook-recovery/*.test.ts'], maxWorkers: 1, fileParallelism: false }
});
