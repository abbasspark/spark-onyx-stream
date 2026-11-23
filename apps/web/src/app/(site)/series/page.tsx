// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageLayout } from '@/components/page-layout';
import { getArrangedPage } from '@/lib/api';

const ALL = '/browse?type=SERIES';

export const metadata: Metadata = {
  title: 'Series',
  alternates: { canonical: '/series' },
};

/**
 * The page "Series" of the menu. Arranged in the panel, it has an opening
 * and rows of its own. Until then, the list of all series is the page.
 */
export default async function SeriesPage() {
  const page = await getArrangedPage('series');
  if (!page) {
    redirect(ALL);
  }
  return (
    <PageLayout page={page} heading="Series">
      <div className="gutter">
        <Link href={ALL} className="button button-quiet">
          All series
          <ArrowRight />
        </Link>
      </div>
    </PageLayout>
  );
}
