// SPDX-License-Identifier: AGPL-3.0-only
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * In development, requests to /v1 are passed on to the API, so the panel and
 * the API share one origin and no cross-origin setup is needed. In production
 * a web server in front of both does the same.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.ONYX_API_URL ?? 'http://localhost:3000';
  // Where the panel lives on its origin. The gateway serves it under /admin/,
  // because the root belongs to the viewer website.
  const base = env.ADMIN_BASE_PATH ?? '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/v1': { target: apiTarget, changeOrigin: false },
      },
    },
    build: {
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.spec.ts'],
    },
  };
});
