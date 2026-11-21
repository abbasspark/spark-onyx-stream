// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// The .env file lives at the repository root and is shared by all packages.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const apiUrl = (process.env.WEB_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // In production the gateway sends /v1 to the API itself. Without a gateway,
  // as in development, the website passes these requests on, so the browser
  // talks to one origin either way.
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` }];
  },
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
