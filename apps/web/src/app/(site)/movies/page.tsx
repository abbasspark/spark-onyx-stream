// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageLayout } from '@/components/page-layout';
import { getArrangedPage } from '@/lib/api';

const ALL = '/browse?type=MOVIE';

export const metadata: Metadata = {
  title: 'Movies',
  alternates: { canonical: '/movies' },
};

/**
 * The page "Movies" of the menu. Arranged in the panel, it has an opening
 * and rows of its own. Until then, the list of all movies is the page.
 */
export default async function MoviesPage() {
  const page = await getArrangedPage('movies');
  if (!page) {
    redirect(ALL);
  }
  return (
    <PageLayout page={page} heading="Movies">
      <div className="gutter">
        <Link href={ALL} className="button button-quiet">
          All movies
          <ArrowRight />
        </Link>
      </div>
    </PageLayout>
  );
}
