// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageLayout } from '@/components/page-layout';
import { getSubjectPage } from '@/lib/api';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

/** The list of everything in the category, with its filters. */
const listOf = (slug: string) => `/browse?category=${encodeURIComponent(slug)}`;

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await getSubjectPage('category', slug);
  return found
    ? {
        title: found.subject.name,
        description: found.subject.description ?? undefined,
        alternates: { canonical: `/category/${found.subject.slug}` },
      }
    : {};
}

/**
 * The page of a category. Arranged in the panel, it has an opening and rows
 * that hold only titles of this category. Until then, and for a category that
 * does not exist, the list is the page: it says what there is, or that
 * there is nothing.
 */
export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const found = await getSubjectPage('category', slug);
  if (!found) {
    redirect(listOf(slug));
  }
  const { subject, page } = found;
  const Heading = page.hero ? 'h2' : 'h1';
  return (
    <PageLayout
      page={page}
      heading={subject.name}
      lead={
        <header className="gutter">
          <Heading className="display text-3xl sm:text-4xl">{subject.name}</Heading>
          {subject.description ? (
            <p className="mt-3 max-w-2xl text-lg text-smoke">{subject.description}</p>
          ) : null}
        </header>
      }
    >
      <div className="gutter">
        <Link href={listOf(subject.slug)} className="button button-quiet">
          Everything in {subject.name}
          <ArrowRight />
        </Link>
      </div>
    </PageLayout>
  );
}
