// SPDX-License-Identifier: AGPL-3.0-only
import { Info, ListVideo, Play } from 'lucide-react';
import Link from 'next/link';
import type { TitleCard } from '@/lib/types';
import { Facts } from './facts';

/**
 * The opening of the home page: one title, shown as large as its artwork
 * allows. The artwork is the statement, the interface stays out of its way.
 */
export function Hero({ title }: { title: TitleCard }) {
  const isSeries = title.type === 'SERIES';

  return (
    <section
      aria-label={`Featured: ${title.name}`}
      className="relative flex min-h-[min(88dvh,56rem)] items-end overflow-hidden"
    >
      {title.backdrop ? (
        <img
          src={title.backdrop.url}
          alt=""
          width={title.backdrop.width}
          height={title.backdrop.height}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 bg-ash" />
      )}
      {/* Darkens the side the text sits on and melts the picture into the page below. */}
      <div className="absolute inset-0 bg-linear-to-r from-onyx/85 via-onyx/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-onyx to-transparent" />

      <div className="gutter relative w-full pt-32 pb-14 sm:pb-20">
        <div className="max-w-2xl">
          {title.logo ? (
            <h1>
              <img
                src={title.logo.url}
                alt={title.name}
                width={title.logo.width}
                height={title.logo.height}
                className="max-h-40 w-auto max-w-[min(100%,28rem)] object-contain object-left"
              />
            </h1>
          ) : (
            <h1 className="display text-4xl sm:text-5xl">{title.name}</h1>
          )}
          {title.tagline ? (
            <p className="mt-5 max-w-xl text-lg text-vein/90">{title.tagline}</p>
          ) : null}
          <Facts title={title} className="mt-4 text-vein/80" />
          <div className="mt-7 flex flex-wrap gap-3">
            {isSeries ? (
              <Link href={`/title/${title.slug}#episodes`} className="button button-play">
                <ListVideo />
                Episodes
              </Link>
            ) : (
              <Link href={`/watch/${title.slug}`} className="button button-play">
                <Play className="fill-current" />
                Play
              </Link>
            )}
            <Link href={`/title/${title.slug}`} className="button button-quiet">
              <Info />
              Details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
