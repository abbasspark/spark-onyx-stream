// SPDX-License-Identifier: AGPL-3.0-only
import Link from 'next/link';
import { describeLength } from '@/lib/format';
import type { TitleCard } from '@/lib/types';

/**
 * A stand-in for a title without a poster: its name, set like poster
 * lettering over bands.
 */
function PosterFallback({ name }: { name: string }) {
  return (
    <div className="relative flex size-full items-end overflow-hidden bg-ash p-3">
      <div aria-hidden="true" className="absolute inset-x-0 top-[18%] grid gap-[6%]">
        <span className="block h-[5cqw] bg-vein/10" />
        <span className="block h-[2cqw] bg-sard/50" />
        <span className="block h-[9cqw] bg-vein/5" />
      </div>
      <span className="display relative text-[clamp(1rem,16cqw,2.25rem)] break-words hyphens-auto">
        {name}
      </span>
    </div>
  );
}

interface PosterCardProps {
  title: TitleCard;
  /** Above the fold: loaded at once instead of when scrolled near. */
  eager?: boolean;
  className?: string;
}

/** One title as an upright poster with its name underneath. */
export function PosterCard({ title, eager, className }: PosterCardProps) {
  const facts = [title.releaseYear, describeLength(title)].filter(Boolean);

  return (
    <Link href={`/title/${title.slug}`} className={`group block ${className ?? ''}`}>
      <div className="@container relative aspect-[2/3] overflow-hidden rounded-[3px] bg-ash outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 group-hover:outline-vein group-focus-visible:outline-sard">
        {title.poster ? (
          <img
            src={title.poster.url}
            alt=""
            width={title.poster.width}
            height={title.poster.height}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <PosterFallback name={title.name} />
        )}
      </div>
      <p className="mt-2.5 truncate text-sm font-medium" title={title.name}>
        {title.name}
      </p>
      {facts.length > 0 ? (
        <p className="flex gap-2.5 truncate text-xs text-smoke">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      ) : null}
    </Link>
  );
}
