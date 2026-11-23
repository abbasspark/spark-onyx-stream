// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode, Suspense } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LanguageSwitch } from '@/components/language-switch';
import {
  currentLanguage,
  getCategories,
  getChannels,
  getLanguages,
  getPlans,
  getSite,
} from '@/lib/api';
import { nativeLanguageName } from '@/lib/language';
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
  // Asked for together. A site without plans or live channels shows no link to them.
  const [site, categories, hasPlans, hasLive, languages, language] = await Promise.all([
    getSite(),
    loadCategories(),
    getPlans()
      .then((offer) => offer.plans.length > 0)
      .catch(() => false),
    getChannels()
      .then((channels) => channels.length > 0)
      .catch(() => false),
    getLanguages().catch(() => ({ default: 'en', translated: [] })),
    currentLanguage(),
  ]);
  const offered = [languages.default, ...languages.translated.map((item) => item.language)];
  // A language that is no longer on offer falls back to the catalog's own.
  const current = language && offered.includes(language) ? language : languages.default;

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
        <SiteHeader
          siteName={site.name}
          logo={site.logo}
          logoShowsName={site.logoShowsName}
          categories={categories}
          hasPlans={hasPlans}
          hasLive={hasLive}
        />
      </Suspense>
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter
        siteName={site.name}
        logo={site.logo}
        logoShowsName={site.logoShowsName}
        footerText={site.footerText}
        footerLinks={site.footerLinks}
        categories={categories}
        hasPlans={hasPlans}
        hasLive={hasLive}
        languageSwitch={
          offered.length > 1 ? (
            <LanguageSwitch
              own={languages.default}
              current={current}
              languages={offered.map((tag) => ({ tag, name: nativeLanguageName(tag) }))}
            />
          ) : null
        }
      />
    </div>
  );
}
