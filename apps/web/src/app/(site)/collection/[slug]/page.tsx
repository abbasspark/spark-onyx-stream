// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PosterCard } from '@/components/poster-card';
import { getCollection, getSite } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';
import { truncate } from '@/lib/format';

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [collection, site] = await Promise.all([getCollection(slug), getSite()]);
  if (!collection) {
    return { title: 'Not found' };
  }
  const description = truncate(
    collection.synopsis ||
      `${collection.titles.length} ${collection.titles.length === 1 ? 'title' : 'titles'} on ${site.name}.`,
    160,
  );
  const image = collection.backdrop ?? collection.poster;
  return {
    title: collection.name,
    description,
    alternates: { canonical: `/collection/${collection.slug}` },
    openGraph: {
      title: collection.name,
      description,
      url: `/collection/${collection.slug}`,
      images: image
        ? [{ url: absoluteUrl(image.url), width: image.width, height: image.height }]
        : undefined,
    },
  };
}

/** Titles that belong together, in their order. */
export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) {
    notFound();
  }

  return (
    <article>
      <header className="relative flex min-h-[min(48dvh,30rem)] items-end overflow-hidden">
        {collection.backdrop ? (
          <img
            src={collection.backdrop.url}
            alt=""
            width={collection.backdrop.width}
            height={collection.backdrop.height}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-coal" />
        )}
        <div className="absolute inset-0 bg-linear-to-r from-onyx/90 via-onyx/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-onyx to-transparent" />
        <div className="gutter relative w-full pt-32 pb-8">
          <p className="text-sm text-sard">Collection</p>
          <h1 className="display mt-2 text-4xl sm:text-5xl">{collection.name}</h1>
          {collection.synopsis ? (
            <p className="mt-5 max-w-[65ch] text-lg leading-relaxed whitespace-pre-line text-vein/85">
              {collection.synopsis}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-smoke">
            {collection.titles.length} {collection.titles.length === 1 ? 'title' : 'titles'}
          </p>
        </div>
      </header>

      {collection.titles.length === 0 ? (
        <p className="gutter mt-12 text-smoke">Nothing of this collection can be watched yet.</p>
      ) : (
        <ol className="gutter mt-8 grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-x-[clamp(0.5rem,1vw,0.875rem)] gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {collection.titles.map((title, index) => (
            <li key={title.id}>
              <PosterCard title={title} eager={index < 12} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
