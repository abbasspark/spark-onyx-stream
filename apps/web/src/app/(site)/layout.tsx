// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode, Suspense } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCategories } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import type { Category } from '@/lib/types';

/** The categories for the menus. Without them the page still works. */
async function loadCategories(): Promise<Category[]> {
  try {
    return await getCategories();
  } catch {
    return [];
  }
}

/** The frame of every page except the player: header, content, footer. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const categories = await loadCategories();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-vein focus:px-4 focus:py-2 focus:text-onyx"
      >
        Skip to the content
      </a>
      {/* The header reads the address, which for some pages is only known in the browser. */}
      <Suspense fallback={<div className="h-16" />}>
        <SiteHeader siteName={siteConfig.name} categories={categories} />
      </Suspense>
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter siteName={siteConfig.name} categories={categories} />
    </div>
  );
}
