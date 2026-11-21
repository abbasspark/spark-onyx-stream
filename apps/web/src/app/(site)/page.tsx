// SPDX-License-Identifier: AGPL-3.0-only
import { ContinueWatching } from '@/components/continue-watching';
import { Hero } from '@/components/hero';
import { PosterCard } from '@/components/poster-card';
import { StripRow } from '@/components/title-row';
import { getHome } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import type { HomeRow } from '@/lib/types';

/** Where "See all" of a row leads. */
function rowHref(row: HomeRow): string {
  if (row.category) {
    return `/browse?category=${row.category.slug}`;
  }
  return row.key === 'featured' ? '/browse?featured=true' : '/browse';
}

export default async function HomePage() {
  const { rows } = await getHome();
  const lead = rows.find((row) => row.key === 'featured') ?? rows[0];
  const hero = lead?.titles.find((title) => title.backdrop) ?? lead?.titles[0];

  if (!hero) {
    return (
      <div className="gutter flex min-h-[70dvh] flex-col justify-center pt-24">
        <h1 className="display max-w-3xl text-4xl sm:text-5xl">Nothing to watch yet</h1>
        <p className="mt-6 max-w-xl text-lg text-smoke">
          {siteConfig.name} has no published titles at the moment. Come back soon.
        </p>
      </div>
    );
  }

  // A featured row with a single title would only repeat the hero.
  const shown = rows.filter((row) => !(row.key === 'featured' && row.titles.length < 2));

  return (
    <>
      <Hero title={hero} />
      <div className="relative z-10 -mt-6 flex flex-col gap-12 sm:gap-14">
        <ContinueWatching />
        {shown.map((row, rowIndex) => (
          <StripRow key={row.key} heading={row.name} href={rowHref(row)}>
            {row.titles.map((title) => (
              <li key={title.id} className="w-[clamp(8.5rem,38vw,12.5rem)]">
                <PosterCard title={title} eager={rowIndex === 0} />
              </li>
            ))}
          </StripRow>
        ))}
      </div>
    </>
  );
}
