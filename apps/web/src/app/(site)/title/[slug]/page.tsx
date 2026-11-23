// SPDX-License-Identifier: AGPL-3.0-only
import { Play } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeList } from '@/components/episode-list';
import { Facts } from '@/components/facts';
import { PersonCard } from '@/components/person-card';
import { PosterCard } from '@/components/poster-card';
import { TitleActions } from '@/components/title-actions';
import { StripRow } from '@/components/title-row';
import { getCollection, getPlans, getTitle, getTitles } from '@/lib/api';
import { DEFAULT_RENTAL, NO_PLANS, subscribable } from '@/lib/plans';
import { absoluteUrl, siteConfig } from '@/lib/config';
import {
  EXTRA_KIND_LABELS,
  formatDay,
  formatMinutes,
  formatRating,
  formatRuntime,
  groupCrew,
  isoDuration,
  SERIES_STATUS_LABELS,
  truncate,
} from '@/lib/format';
import { countryName, languageName } from '@/lib/language';
import { watchHref } from '@/lib/watch';
import type { Collection, TitleCard, TitleDetail } from '@/lib/types';

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
    datePublished: title.releaseDate ?? (title.releaseYear ? String(title.releaseYear) : undefined),
    contentRating: title.ageRating ?? undefined,
    inLanguage: title.originalLanguage ?? undefined,
    genre: (title.genres?.length ? title.genres : title.categories).map((item) => item.name),
    actor: title.cast?.map((person) => ({
      '@type': 'Person',
      name: person.name,
      url: `${siteConfig.url}/person/${person.slug}`,
    })),
    director: title.crew
      ?.filter((person) => person.role === 'Director')
      .map((person) => ({ '@type': 'Person', name: person.name })),
    countryOfOrigin: title.countries?.map((code) => ({ '@type': 'Country', name: code })),
    aggregateRating:
      title.rating && title.ratingCount
        ? {
            '@type': 'AggregateRating',
            ratingValue: title.rating,
            bestRating: 10,
            ratingCount: title.ratingCount,
          }
        : undefined,
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

/** The first collection the title is in, with its other titles. */
async function loadCollection(title: TitleDetail): Promise<Collection | null> {
  const first = title.collections?.[0];
  if (!first) {
    return null;
  }
  try {
    return await getCollection(first.slug);
  } catch {
    // The page is complete without this row.
    return null;
  }
}

export default async function TitlePage({ params }: TitlePageProps) {
  const { slug } = await params;
  const title = await getTitle(slug);
  if (!title) {
    notFound();
  }
  // A free title needs no offer, and the page must not fail because the plans could not be read.
  const [related, collection, plans] = await Promise.all([
    loadRelated(title),
    loadCollection(title),
    title.access === 'PAID' ? getPlans().catch(() => NO_PLANS) : NO_PLANS,
  ]);
  const offer = {
    currency: plans.currency,
    checkout: plans.checkout,
    contactUrl: plans.contactUrl,
    rental: plans.rental ?? DEFAULT_RENTAL,
    subscribable: subscribable(title, plans.plans),
  };
  const firstCategory = title.categories[0];
  const genres = title.genres ?? [];
  const cast = title.cast ?? [];
  const crew = groupCrew(title.crew ?? []);
  const extras = title.extras ?? [];
  const rating = formatRating(title.rating);
  const released = formatDay(title.releaseDate);
  // A movie says its exact length among the facts above. A series says here what an episode runs.
  const episodeLength = title.type === 'SERIES' ? formatMinutes(title.runtimeMinutes) : null;

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
              <TitleActions title={title} offer={offer} />
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
          {crew.length > 0 ? (
            <dl className="mt-8 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
              {crew.map((group) => (
                <div key={group.job} className="contents">
                  <dt className="text-dust">{group.job}</dt>
                  <dd className="flex flex-wrap gap-x-3 gap-y-1">
                    {group.people.map((person) => (
                      <Link
                        key={person.slug}
                        href={`/person/${person.slug}`}
                        className="underline decoration-line underline-offset-4 hover:decoration-vein"
                      >
                        {person.name}
                      </Link>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <dl className="grid content-start gap-4 text-sm">
          {genres.length > 0 ? (
            <div>
              <dt className="text-dust">{genres.length === 1 ? 'Genre' : 'Genres'}</dt>
              <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {genres.map((genre) => (
                  <Link
                    key={genre.slug}
                    href={`/browse?genre=${genre.slug}`}
                    className="underline decoration-line underline-offset-4 hover:decoration-vein"
                  >
                    {genre.name}
                  </Link>
                ))}
              </dd>
            </div>
          ) : null}
          {rating ? (
            <div>
              <dt className="text-dust">Rating</dt>
              <dd className="mt-1">
                <span className="font-semibold text-sard">{rating}</span>
                <span className="text-smoke"> of 10</span>
                {title.ratingCount ? (
                  <span className="text-dust">
                    , {title.ratingCount.toLocaleString('en')} votes
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {released ? (
            <div>
              <dt className="text-dust">{title.type === 'SERIES' ? 'First shown' : 'Released'}</dt>
              <dd className="mt-1">{released}</dd>
            </div>
          ) : null}
          {title.seriesStatus ? (
            <div>
              <dt className="text-dust">Status</dt>
              <dd className="mt-1">{SERIES_STATUS_LABELS[title.seriesStatus]}</dd>
            </div>
          ) : null}
          {episodeLength ? (
            <div>
              <dt className="text-dust">An episode runs</dt>
              <dd className="mt-1">about {episodeLength}</dd>
            </div>
          ) : null}
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
          {title.countries?.length ? (
            <div>
              <dt className="text-dust">Made in</dt>
              <dd className="mt-1">{title.countries.map(countryName).join(', ')}</dd>
            </div>
          ) : null}
          {title.studios?.length ? (
            <div>
              <dt className="text-dust">{title.studios.length === 1 ? 'Studio' : 'Studios'}</dt>
              <dd className="mt-1">{title.studios.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {title.type === 'SERIES' ? <EpisodeList title={title} /> : null}

      {cast.length > 0 ? (
        <div className="mt-20">
          <StripRow heading="Cast">
            {cast.map((person) => (
              <li key={`${person.slug}:${person.role}`} className="w-[clamp(7rem,30vw,9.5rem)]">
                <PersonCard person={person} />
              </li>
            ))}
          </StripRow>
        </div>
      ) : null}

      {extras.length > 0 ? (
        <div className="mt-20">
          <StripRow heading="Trailers and more">
            {extras.map((extra) => {
              const length = formatRuntime(extra.durationMs);
              return (
                <li key={extra.id} className="w-[clamp(14rem,60vw,20rem)]">
                  <Link href={`${watchHref(title.slug)}?extra=${extra.id}`} className="group block">
                    <div className="relative aspect-video overflow-hidden rounded-[3px] bg-ash outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 group-hover:outline-vein group-focus-visible:outline-sard">
                      {title.backdrop ? (
                        <img
                          src={title.backdrop.url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover opacity-60 transition-opacity duration-150 group-hover:opacity-80"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-onyx/70 text-vein">
                          <Play className="size-5 translate-x-px fill-current" aria-hidden="true" />
                        </span>
                      </span>
                      <span className="absolute top-2 left-2 rounded-[3px] bg-onyx/80 px-1.5 text-[0.6875rem] leading-6 font-medium text-sard">
                        {EXTRA_KIND_LABELS[extra.kind]}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm leading-snug font-medium">{extra.name}</p>
                    {length ? <p className="mt-0.5 text-sm text-smoke">{length}</p> : null}
                  </Link>
                </li>
              );
            })}
          </StripRow>
        </div>
      ) : null}

      {collection && collection.titles.length > 1 ? (
        <div className="mt-20">
          <StripRow heading={collection.name} href={`/collection/${collection.slug}`}>
            {collection.titles.map((item) => (
              <li key={item.id} className="w-[clamp(8.5rem,38vw,12.5rem)]">
                <PosterCard title={item} />
              </li>
            ))}
          </StripRow>
        </div>
      ) : null}

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

      {title.metadataSource === 'tmdb' ? (
        // TMDB asks to be named where its material is shown, in these words.
        <p className="gutter mt-16 text-xs text-dust">
          Details and artwork of this title come from{' '}
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-smoke"
          >
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      ) : null}
    </article>
  );
}
