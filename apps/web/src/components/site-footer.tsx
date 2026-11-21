// SPDX-License-Identifier: AGPL-3.0-only
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { BandMark } from './brand';

export function SiteFooter({ siteName, categories }: { siteName: string; categories: Category[] }) {
  return (
    <footer className="gutter mt-24 border-t border-line pt-10 pb-12 text-sm text-smoke">
      <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
        <div className="flex items-center gap-2.5 text-vein">
          <BandMark className="size-6" />
          <span className="heading text-base">{siteName}</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-16 gap-y-8">
          <ul className="grid content-start gap-2">
            <li>
              <Link href="/browse" className="hover:text-vein">
                Everything
              </Link>
            </li>
            <li>
              <Link href="/browse?type=MOVIE" className="hover:text-vein">
                Movies
              </Link>
            </li>
            <li>
              <Link href="/browse?type=SERIES" className="hover:text-vein">
                Series
              </Link>
            </li>
            <li>
              <Link href="/search" className="hover:text-vein">
                Search
              </Link>
            </li>
          </ul>
          {categories.length > 0 ? (
            <ul className="grid grid-flow-col grid-rows-4 content-start gap-x-12 gap-y-2">
              {categories.slice(0, 12).map((category) => (
                <li key={category.slug}>
                  <Link href={`/browse?category=${category.slug}`} className="hover:text-vein">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
      </div>
      <p className="mt-10 text-xs text-dust">
        Runs on{' '}
        <a
          href="https://github.com/abbasspark/spark-onyx-stream"
          className="underline underline-offset-2 hover:text-smoke"
        >
          Spark Onyx Stream
        </a>
        , open-source software under the AGPL-3.0 license.
      </p>
    </footer>
  );
}
