import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig(({ mode }) => ({
  root: local('../../..'),
  cacheDir: local('../../../.qa-browser-cache'),
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: local('./navigation.ts') },
      ...['useAuth', 'useConversations', 'useQuota', 'useVoiceInput'].filter(hook => mode !== 'auth-recovery' || hook !== 'useAuth').map(hook => ({
        find: `@/hooks/${hook}`, replacement: local('./hooks.ts'),
      })),
      { find: '@/lib/supabase', replacement: local(mode === 'auth-recovery' ? './auth-supabase.ts' : './supabase.ts') },
      { find: '@', replacement: local('../../../src') },
    ],
  },
  define: { 'process.env.NEXT_PUBLIC_SIRET': '""' },
  css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 51066, strictPort: true },
  plugins: [{
    name: 'model-selection-fixture',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/dashboard/')) req.url = '/tests/model-selection/browser/index.html'
        next()
      })
    },
  }],
}))
