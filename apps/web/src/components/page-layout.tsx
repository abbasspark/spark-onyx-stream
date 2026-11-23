// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Home, HomeRow } from '@/lib/types';
import { rowHref } from '@/lib/home';
import { ContinueWatching } from './continue-watching';
import { MyListRow } from './my-list';
import { HeroStage } from './hero-stage';
import { LandscapeCard } from './landscape-card';
import { PosterCard } from './poster-card';
import { StripRow } from './title-row';

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

interface PageLayoutProps {
  page: Home;
  /** The heading of the page for those who cannot see it, when it has no opening. */
  heading: string;
  /** Shown above the first row: what the page is the page of. */
  lead?: ReactNode;
  /** Shown after the last row. */
  children?: ReactNode;
}

/** The rows of an arranged page, in their order and look, without an opening. */
export function PageRows({ rows }: { rows: HomeRow[] }) {
  const firstTitles = rows.findIndex((row) => row.kind === 'titles');
  return rows.map((row, index) =>
    row.kind === 'continue' ? (
      <ContinueWatching key={row.key} />
    ) : row.kind === 'list' ? (
      <MyListRow key={row.key} heading={row.name} />
    ) : (
      <StripRow key={row.key} heading={row.name} href={rowHref(row)}>
        <RowCards row={row} eager={index === firstTitles} />
      </StripRow>
    ),
  );
}

/**
 * A page as it is arranged in the panel: its opening, then its rows in their
 * order and look. The home page, "Movies", "Series" and the pages of
 * categories and genres are all drawn here.
 */
export function PageLayout({ page, heading, lead, children }: PageLayoutProps) {
  return (
    <>
      {page.hero ? (
        <HeroStage titles={page.hero.titles} />
      ) : lead ? null : (
        // A lead carries the heading of the page itself.
        <h1 className="sr-only">{heading}</h1>
      )}
      <div
        className={
          page.hero
            ? 'relative z-10 -mt-6 flex flex-col gap-12 sm:gap-14'
            : // Without an opening the rows start under the header of the site.
              'flex flex-col gap-12 pt-28 sm:gap-14 sm:pt-32'
        }
      >
        {lead}
        <PageRows rows={page.rows} />
        {children}
      </div>
    </>
  );
}
