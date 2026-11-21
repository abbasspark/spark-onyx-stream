import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests that need a real database read TEST_DATABASE_URL from the root .env file.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Migrates the test database before the first suite.
    globalSetup: ['./test/support/global-setup.ts'],
    // The suites share one database, so they must not run at the same time.
    fileParallelism: false,
  },
});
