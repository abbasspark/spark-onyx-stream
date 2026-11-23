// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PosterCard } from '@/components/poster-card';
import { getPerson, getSite } from '@/lib/api';
import { absoluteUrl, siteConfig } from '@/lib/config';
import { truncate } from '@/lib/format';

interface PersonPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PersonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [person, site] = await Promise.all([getPerson(slug), getSite()]);
  if (!person) {
    return { title: 'Not found' };
  }
  const description = truncate(
    person.biography ??
      `${person.titles.length} ${person.titles.length === 1 ? 'title' : 'titles'} with ${person.name} on ${site.name}.`,
    160,
  );
  return {
    title: person.name,
    description,
    alternates: { canonical: `/person/${person.slug}` },
    openGraph: {
      type: 'profile',
      title: person.name,
      description,
      url: `/person/${person.slug}`,
      images: person.portrait
        ? [
            {
              url: absoluteUrl(person.portrait.url),
              width: person.portrait.width,
              height: person.portrait.height,
            },
          ]
        : undefined,
    },
  };
}

/** Somebody of the cast or crew: who they are, and everything of theirs there is to watch. */
export default async function PersonPage({ params }: PersonPageProps) {
  const { slug } = await params;
  const person = await getPerson(slug);
  if (!person) {
    notFound();
  }
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: person.name,
    url: `${siteConfig.url}/person/${person.slug}`,
    description: person.biography ?? undefined,
    image: person.portrait ? absoluteUrl(person.portrait.url) : undefined,
    jobTitle: person.knownFor ?? undefined,
  };

  return (
    <article className="pt-28">
      <script
        type="application/ld+json"
        // "<" is escaped so that a text can never end the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
      />
      <header className="gutter grid gap-x-12 gap-y-8 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        {person.portrait ? (
          <img
            src={person.portrait.url}
            alt=""
            width={person.portrait.width}
            height={person.portrait.height}
            fetchPriority="high"
            className="aspect-[4/5] w-full max-w-56 rounded-[3px] bg-ash object-cover object-top"
          />
        ) : null}
        <div className={person.portrait ? 'self-end' : 'sm:col-span-2'}>
          {person.knownFor ? <p className="text-sm text-sard">{person.knownFor}</p> : null}
          <h1 className="display mt-2 text-4xl sm:text-5xl">{person.name}</h1>
          {person.biography ? (
            <p className="mt-6 max-w-[65ch] text-lg leading-relaxed whitespace-pre-line text-vein/85">
              {person.biography}
            </p>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="titles" className="mt-16">
        <h2 id="titles" className="gutter heading text-lg sm:text-xl">
          {person.titles.length === 1 ? 'To watch' : `${person.titles.length} titles to watch`}
        </h2>
        <ul className="gutter mt-5 grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-x-[clamp(0.5rem,1vw,0.875rem)] gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {person.titles.map((title, index) => (
            <li key={title.id}>
              <PosterCard title={title} eager={index < 12} />
              {title.role ? <p className="mt-1 text-sm text-smoke">{title.role}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
