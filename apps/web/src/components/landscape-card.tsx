// SPDX-License-Identifier: AGPL-3.0-only
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { describeLength } from '@/lib/format';
import type { TitleCard } from '@/lib/types';
import { MyListButton } from './my-list';

/** One title as a wide card: its backdrop, with the logo or the name set on it. */
export function LandscapeCard({ title, eager }: { title: TitleCard; eager?: boolean }) {
  const picture = title.backdrop ?? title.poster;
  const facts = [title.releaseYear, describeLength(title)].filter(Boolean);

  return (
    <div className="group/card relative">
      <Link href={`/title/${title.slug}`} className="group block">
        <div className="relative aspect-video overflow-hidden rounded-[3px] bg-ash outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 group-hover:outline-vein group-focus-visible:outline-sard">
          {picture ? (
            <img
              src={picture.url}
              alt=""
              width={picture.width}
              height={picture.height}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              className="size-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-linear-to-t from-onyx/85 via-onyx/10 to-transparent" />
          <div className="absolute inset-x-3 bottom-3">
            {title.logo ? (
              <img
                src={title.logo.url}
                alt=""
                width={title.logo.width}
                height={title.logo.height}
                loading="lazy"
                className="max-h-12 w-auto max-w-[60%] object-contain object-left"
              />
            ) : (
              <span className="heading line-clamp-2 text-base">{title.name}</span>
            )}
          </div>
          {title.access === 'PAID' ? (
            <span className="absolute top-2 left-2 flex h-6 items-center gap-1 rounded-[3px] bg-onyx/80 px-1.5 text-[0.6875rem] font-medium text-sard">
              <Lock className="size-3" aria-hidden="true" />
              <span className="sr-only">Needs a subscription. </span>
              <span aria-hidden="true">Plan</span>
            </span>
          ) : null}
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
      <MyListButton title={{ id: title.id, slug: title.slug, name: title.name }} look="card" />
    </div>
  );
}
