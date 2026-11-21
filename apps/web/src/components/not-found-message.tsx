// SPDX-License-Identifier: AGPL-3.0-only
import Link from 'next/link';

/** Shown for an address that leads nowhere, and for a title that is gone. */
export function NotFoundMessage() {
  return (
    <div className="gutter flex min-h-[70dvh] flex-col justify-center pt-24">
      <h1 className="display max-w-3xl text-4xl sm:text-5xl">This page is not here</h1>
      <p className="mt-6 max-w-xl text-lg text-smoke">
        The address may be wrong, or the title is no longer available.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="button button-play">
          Go to the home page
        </Link>
        <Link href="/search" className="button button-quiet">
          Search
        </Link>
      </div>
    </div>
  );
}
