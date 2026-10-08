import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const core = (dir: string) => fileURLToPath(new URL('../../packages/core/src/' + dir, import.meta.url));
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev').slice(0, 12);

export default defineConfig({
  define: {'__APP_BUILD_ID__': JSON.stringify(buildId)},
  plugins: [react()],
  // Relative asset URLs: the same build works from a domain root, a sub-path or a Capacitor WebView.
  base: './',
  resolve: {
    alias: {
      '@appbase/core': core('core'),
      '@appbase/types': core('types'),
      '@appbase/ui-react': fileURLToPath(new URL('../../packages/ui-react/src', import.meta.url)),
      'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
    }
  },
  server: {
    // Core sources live outside this app folder.
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
