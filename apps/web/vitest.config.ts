// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { globals: true, include: ['src/**/*.spec.ts'] },
});
