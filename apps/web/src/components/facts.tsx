// SPDX-License-Identifier: AGPL-3.0-only
import { Fragment, type ReactNode } from 'react';
import { describeLength } from '@/lib/format';
import type { TitleCard } from '@/lib/types';

/** A hairline between two facts. It is drawn, not read out. */
function Divider() {
  return <li aria-hidden="true" className="h-3 w-px bg-line" />;
}

/**
 * The few facts people look for first: the year, the age rating, how long it
 * is. The rating sits in a box, as it does on a film poster, and the facts
 * are divided by hairlines rather than left to float apart.
 */
export function Facts({ title, className }: { title: TitleCard; className?: string }) {
  const length = describeLength(title);
  const items: ReactNode[] = [];

  if (title.releaseYear) {
    items.push(
      <li key="year">
        <span className="sr-only">Released </span>
        {title.releaseYear}
      </li>,
    );
  }
  if (title.ageRating) {
    items.push(
      <li
        key="rating"
        className="rounded-[2px] border border-vein/50 px-1.5 text-xs leading-5 font-semibold"
      >
        <span className="sr-only">Age rating </span>
        {title.ageRating}
      </li>,
    );
  }
  if (length) {
    items.push(<li key="length">{length}</li>);
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className ?? ''}`}>
      {items.map((item, index) => (
        // The facts are fixed in number and order, so their position names them.
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 ? <Divider /> : null}
          {item}
        </Fragment>
      ))}
    </ul>
  );
}
