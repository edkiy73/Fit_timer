import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = (path: string) => fileURLToPath(new URL('../../' + path, import.meta.url));

const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev').slice(0, 12);

export default defineConfig({
  plugins: [react()],
  define: {'__APP_BUILD_ID__': JSON.stringify(buildId)},
  base: './',
  resolve: {
    alias: {
      '@appbase/core': root('packages/core/src/core'),
      '@appbase/types': root('packages/core/src/types'),
      '@appbase/ui-react': root('packages/ui-react/src'),
      'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
    }
  },
  server: {fs: {allow: [root('')]}},
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
