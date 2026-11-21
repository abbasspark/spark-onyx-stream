// SPDX-License-Identifier: AGPL-3.0-only
import { describeLength } from '@/lib/format';
import type { TitleCard } from '@/lib/types';

/**
 * The few facts people look for first: the year, the age rating, how long it
 * is. The rating sits in a box, as it does on a film poster.
 */
export function Facts({ title, className }: { title: TitleCard; className?: string }) {
  const length = describeLength(title);
  if (!title.releaseYear && !title.ageRating && !length) {
    return null;
  }

  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${className ?? ''}`}>
      {title.releaseYear ? (
        <li>
          <span className="sr-only">Released </span>
          {title.releaseYear}
        </li>
      ) : null}
      {title.ageRating ? (
        <li className="rounded-[2px] border border-vein/50 px-1.5 text-xs leading-5 font-semibold">
          <span className="sr-only">Age rating </span>
          {title.ageRating}
        </li>
      ) : null}
      {length ? <li>{length}</li> : null}
    </ul>
  );
}
