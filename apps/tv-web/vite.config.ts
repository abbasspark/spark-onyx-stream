// SPDX-License-Identifier: AGPL-3.0-only
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * The app is served by the gateway under /tv/, on the same origin as the API,
 * so the television needs no cross-origin setup. In development, requests to
 * /v1 go to the API for the same reason.
 *
 * The build is lowered to what a television from 2021 runs. The library has
 * Chromium 76 (Tizen 6.0) and Chromium 79 (webOS 6), which lack syntax that
 * newer browsers take for granted. Newer methods are not polyfilled: the code
 * does not use any that those engines lack.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.ONYX_API_URL ?? 'http://localhost:3000';
  const base = env.TV_BASE_PATH ?? '/tv/';

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      port: 5175,
      strictPort: true,
      proxy: { '/v1': { target: apiTarget, changeOrigin: false } },
    },
    build: {
      target: 'chrome76',
      cssTarget: 'chrome76',
      sourcemap: false,
      // hls.js is loaded only where a browser cannot play HLS itself, never on a television.
      chunkSizeWarningLimit: 700,
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.spec.ts', 'tools/**/*.spec.ts'],
    },
  };
});
