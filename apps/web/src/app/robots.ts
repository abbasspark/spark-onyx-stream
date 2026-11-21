// SPDX-License-Identifier: AGPL-3.0-only
import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { siteConfig } from '@/lib/config';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Built per request, so the address of the site can change without a new build.
  await connection();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Players and search results are not pages worth finding. The API is not a page at all.
      disallow: ['/watch/', '/search', '/account', '/sign-in', '/sign-up', '/v1/'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
