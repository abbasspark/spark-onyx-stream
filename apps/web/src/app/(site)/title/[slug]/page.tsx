// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeList } from '@/components/episode-list';
import { Facts } from '@/components/facts';
import { PosterCard } from '@/components/poster-card';
import { TitleActions } from '@/components/title-actions';
import { StripRow } from '@/components/title-row';
import { getTitle, getTitles } from '@/lib/api';
import { absoluteUrl, siteConfig } from '@/lib/config';
import { isoDuration, truncate } from '@/lib/format';
import type { TitleCard, TitleDetail } from '@/lib/types';

interface TitlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: TitlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = await getTitle(slug);
  if (!title) {
    return { title: 'Not found' };
  }

  const description = truncate(title.synopsis ?? title.tagline ?? siteConfig.description, 160);
  const image = title.backdrop ?? title.poster;
  return {
    title: title.releaseYear ? `${title.name} (${title.releaseYear})` : title.name,
    description,
    alternates: { canonical: `/title/${title.slug}` },
    openGraph: {
      type: title.type === 'MOVIE' ? 'video.movie' : 'video.tv_show',
      title: title.name,
      description,
      url: `/title/${title.slug}`,
      images: image
        ? [{ url: absoluteUrl(image.url), width: image.width, height: image.height }]
        : undefined,
    },
  };
}

/** The name of a language for a code such as "en" or "pt-BR". */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** What search engines read to show a title with its picture and facts. */
function structuredData(title: TitleDetail): Record<string, unknown> {
  const image = title.poster ?? title.backdrop;
  return {
    '@context': 'https://schema.org',
    '@type': title.type === 'MOVIE' ? 'Movie' : 'TVSeries',
    name: title.name,
    alternateName: title.originalName ?? undefined,
    url: `${siteConfig.url}/title/${title.slug}`,
    description: title.synopsis ?? title.tagline ?? undefined,
    image: image ? absoluteUrl(image.url) : undefined,
    datePublished: title.releaseYear ? String(title.releaseYear) : undefined,
    contentRating: title.ageRating ?? undefined,
    inLanguage: title.originalLanguage ?? undefined,
    genre: title.categories.map((category) => category.name),
    duration: title.type === 'MOVIE' ? isoDuration(title.durationMs) : undefined,
    numberOfSeasons: title.type === 'SERIES' ? title.seasonCount : undefined,
    numberOfEpisodes: title.type === 'SERIES' ? title.episodeCount : undefined,
  };
}

/** Other titles from the first category of this one. */
async function loadRelated(title: TitleDetail): Promise<TitleCard[]> {
  const category = title.categories[0];
  if (!category) {
    return [];
  }
  try {
    const page = await getTitles({ category: category.slug, pageSize: 20 });
    return page.items.filter((item) => item.id !== title.id);
  } catch {
    // The page is complete without this row.
    return [];
  }
}

export default async function TitlePage({ params }: TitlePageProps) {
  const { slug } = await params;
  const title = await getTitle(slug);
  if (!title) {
    notFound();
  }
  const related = await loadRelated(title);
  const firstCategory = title.categories[0];

  return (
    <article>
      <script
        type="application/ld+json"
        // "<" is escaped so that a text can never end the script element.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(title)).replace(/</g, '\\u003c'),
        }}
      />

      <div className="relative flex min-h-[min(72dvh,46rem)] items-end overflow-hidden">
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
          <div className="absolute inset-0 bg-coal" />
        )}
        <div className="absolute inset-0 bg-linear-to-r from-onyx/90 via-onyx/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-onyx to-transparent" />

        <div className="gutter relative w-full pt-32 pb-10">
          <div className="max-w-3xl">
            {title.logo ? (
              <h1>
                <img
                  src={title.logo.url}
                  alt={title.name}
                  width={title.logo.width}
                  height={title.logo.height}
                  className="max-h-36 w-auto max-w-[min(100%,26rem)] object-contain object-left"
                />
              </h1>
            ) : (
              <h1 className="display text-4xl sm:text-5xl">{title.name}</h1>
            )}
            <Facts title={title} className="mt-5 text-vein/85" />
            <div className="mt-7">
              <TitleActions title={title} />
            </div>
          </div>
        </div>
      </div>

      <div className="gutter mt-6 grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="max-w-[65ch]">
          {title.tagline ? <p className="heading text-xl text-vein">{title.tagline}</p> : null}
          {title.synopsis ? (
            <p className="mt-4 text-lg leading-relaxed whitespace-pre-line text-vein/85">
              {title.synopsis}
            </p>
          ) : null}
        </div>

        <dl className="grid content-start gap-4 text-sm">
          {title.categories.length > 0 ? (
            <div>
              <dt className="text-dust">Categories</dt>
              <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {title.categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/browse?category=${category.slug}`}
                    className="underline decoration-line underline-offset-4 hover:decoration-vein"
                  >
                    {category.name}
                  </Link>
                ))}
              </dd>
            </div>
          ) : null}
          {title.originalName && title.originalName !== title.name ? (
            <div>
              <dt className="text-dust">Original name</dt>
              <dd className="mt-1">{title.originalName}</dd>
            </div>
          ) : null}
          {title.originalLanguage ? (
            <div>
              <dt className="text-dust">Original language</dt>
              <dd className="mt-1">{languageName(title.originalLanguage)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {title.type === 'SERIES' ? <EpisodeList title={title} /> : null}

      {related.length > 0 && firstCategory ? (
        <div className="mt-20">
          <StripRow
            heading={`More in ${firstCategory.name}`}
            href={`/browse?category=${firstCategory.slug}`}
          >
            {related.map((item) => (
              <li key={item.id} className="w-[clamp(8.5rem,38vw,12.5rem)]">
                <PosterCard title={item} />
              </li>
            ))}
          </StripRow>
        </div>
      ) : null}
    </article>
  );
}
