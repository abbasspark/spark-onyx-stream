// SPDX-License-Identifier: AGPL-3.0-only
import { ContinueWatching } from '@/components/continue-watching';
import { HeroStage } from '@/components/hero-stage';
import { LandscapeCard } from '@/components/landscape-card';
import { PosterCard } from '@/components/poster-card';
import { StripRow } from '@/components/title-row';
import { getHome } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import { isEmptyHome, rowHref } from '@/lib/home';
import type { HomeRow } from '@/lib/types';

/** The cards of one row, in the look the row asks for. */
function RowCards({ row, eager }: { row: HomeRow; eager: boolean }) {
  if (row.layout === 'landscape') {
    return row.titles.map((title) => (
      <li key={title.id} className="w-[min(78vw,21rem)]">
        <LandscapeCard title={title} eager={eager} />
      </li>
    ));
  }
  if (row.layout === 'numbered') {
    // A top list: the place of each title stands beside its poster.
    return row.titles.map((title, index) => (
      // Positioned, so that the words for screen readers stay inside the strip.
      <li key={title.id} className="relative flex items-start">
        {/* As tall as the poster, so the figure stands on its lower edge and not on the caption. */}
        <span
          aria-hidden="true"
          className="display -mr-2 flex h-[calc(clamp(7.5rem,32vw,11rem)*1.5)] shrink-0 items-end pl-1 text-[clamp(4.5rem,15vw,7.5rem)] leading-[0.78] text-transparent [-webkit-text-stroke:2px_var(--color-smoke)] select-none"
        >
          {index + 1}
        </span>
        <span className="sr-only">Number {index + 1}: </span>
        <PosterCard title={title} eager={eager} className="relative w-[clamp(7.5rem,32vw,11rem)]" />
      </li>
    ));
  }
  return row.titles.map((title) => (
    <li key={title.id} className="w-[clamp(8.5rem,38vw,12.5rem)]">
      <PosterCard title={title} eager={eager} />
    </li>
  ));
}

export default async function HomePage() {
  const home = await getHome();

  if (isEmptyHome(home)) {
    return (
      <div className="gutter flex min-h-[70dvh] flex-col justify-center pt-24">
        <h1 className="display max-w-3xl text-4xl sm:text-5xl">Nothing to watch yet</h1>
        <p className="mt-6 max-w-xl text-lg text-smoke">
          {siteConfig.name} has no published titles at the moment. Come back soon.
        </p>
      </div>
    );
  }

  const firstTitles = home.rows.findIndex((row) => row.kind === 'titles');

  return (
    <>
      {home.hero ? (
        <HeroStage titles={home.hero.titles} />
      ) : (
        <h1 className="sr-only">{siteConfig.name}</h1>
      )}
      <div
        className={
          home.hero
            ? 'relative z-10 -mt-6 flex flex-col gap-12 sm:gap-14'
            : // Without an opening the rows start under the header of the site.
              'flex flex-col gap-12 pt-28 sm:gap-14 sm:pt-32'
        }
      >
        {home.rows.map((row, index) =>
          row.kind === 'continue' ? (
            <ContinueWatching key={row.key} />
          ) : (
            <StripRow key={row.key} heading={row.name} href={rowHref(row)}>
              <RowCards row={row} eager={index === firstTitles} />
            </StripRow>
          ),
        )}
      </div>
    </>
  );
}
