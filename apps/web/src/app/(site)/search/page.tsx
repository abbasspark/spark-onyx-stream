// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchScreen } from '@/components/search-screen';

export const metadata: Metadata = {
  title: 'Search',
  // Result pages are endless variations of the same thing and not worth indexing.
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <div className="gutter pt-28">
      <h1 className="sr-only">Search</h1>
      <Suspense>
        <SearchScreen />
      </Suspense>
    </div>
  );
}
