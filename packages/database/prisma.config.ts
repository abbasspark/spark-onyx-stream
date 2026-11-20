// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The .env file lives at the repository root and is shared by all packages.
config({ path: path.resolve(import.meta.dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
