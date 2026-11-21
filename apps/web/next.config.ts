// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// The .env file lives at the repository root and is shared by all packages.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const config: NextConfig = {
  // The Docker image runs a self-contained server from .next/standalone. That
  // output does not work with "next start", so it is made only when asked for.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
      }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default config;
