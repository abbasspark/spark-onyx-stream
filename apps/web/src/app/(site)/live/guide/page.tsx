// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideGrid } from '@/components/guide-grid';
import { getChannels, getGuide } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Guide',
  description: 'What the live channels show today.',
};

/** The programme guide: what every channel shows over the next day. */
export default async function GuidePage() {
  const [channels, guide] = await Promise.all([getChannels(), getGuide()]);
  if (!guide || channels.length === 0) {
    notFound();
  }

  return (
    <div className="gutter pt-28 pb-20">
      <header className="mb-8 grid gap-3">
        <p>
          <Link
            href="/live"
            className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
          >
            All channels
          </Link>
        </p>
        <h1 className="display text-5xl sm:text-7xl">Guide</h1>
        <p className="max-w-[60ch] text-smoke">
          What the channels show over the next day, in your own time.
        </p>
      </header>
      <GuideGrid channels={channels} guide={guide} />
    </div>
  );
}
