// SPDX-License-Identifier: AGPL-3.0-only
import type { MetadataRoute } from 'next';
import { getCategories, getGenres, getTitles } from '@/lib/api';
import { siteConfig } from '@/lib/config';

const PAGE_SIZE = 100;
/** A sitemap file may list 50,000 addresses. This stays far below. */
const MAX_TITLES = 5000;

/** Every title page, category and genre, for search engines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${siteConfig.url}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteConfig.url}/browse`, changeFrequency: 'daily', priority: 0.6 },
  ];

  const categories = await getCategories();
  for (const category of categories) {
    entries.push({
      url: `${siteConfig.url}/browse?category=${category.slug}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  for (const genre of await getGenres().catch(() => [])) {
    entries.push({
      url: `${siteConfig.url}/browse?genre=${genre.slug}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  for (let page = 1; (page - 1) * PAGE_SIZE < MAX_TITLES; page += 1) {
    const titles = await getTitles({ page, pageSize: PAGE_SIZE });
    for (const title of titles.items) {
      entries.push({
        url: `${siteConfig.url}/title/${title.slug}`,
        lastModified: title.publishedAt ?? undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
    if (page * PAGE_SIZE >= titles.total) {
      break;
    }
  }
  return entries;
}
