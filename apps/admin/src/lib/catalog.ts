// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleDetail, TitleSummary, UpdateTitleInput } from '@/api/types';
import { formatDuration, humanize } from './format';

/** What a title contains, in a few words: the length of a movie or the size of a series. */
export function describeContent(title: TitleSummary): string {
  if (title.type === 'SERIES') {
    if (title.seasonCount === 0) {
      return 'No seasons yet';
    }
    const seasons = `${title.seasonCount} ${title.seasonCount === 1 ? 'season' : 'seasons'}`;
    const episodes = `${title.episodeCount} ${title.episodeCount === 1 ? 'episode' : 'episodes'}`;
    return `${seasons} · ${episodes}`;
  }
  if (!title.asset) {
    return 'No video yet';
  }
  return title.asset.status === 'READY'
    ? formatDuration(title.asset.durationMs)
    : `Video ${humanize(title.asset.status).toLowerCase()}`;
}

/** The text fields of a title as the form holds them: always strings. */
export interface DetailsForm {
  name: string;
  originalName: string;
  tagline: string;
  synopsis: string;
  releaseYear: string;
  ageRating: string;
  originalLanguage: string;
  slug: string;
  isFeatured: boolean;
  /** Whether watching needs a subscription. */
  isPaid: boolean;
  categoryIds: string[];
}

export function toForm(title: TitleDetail): DetailsForm {
  return {
    name: title.name,
    originalName: title.originalName ?? '',
    tagline: title.tagline ?? '',
    synopsis: title.synopsis ?? '',
    releaseYear: title.releaseYear === null ? '' : String(title.releaseYear),
    ageRating: title.ageRating ?? '',
    originalLanguage: title.originalLanguage ?? '',
    slug: title.slug,
    isFeatured: title.isFeatured,
    isPaid: title.access === 'PAID',
    categoryIds: title.categories.map((category) => category.id).sort(),
  };
}

/** The fields that differ from what is saved, in the shape the API takes. */
export function changedFields(saved: DetailsForm, form: DetailsForm): UpdateTitleInput {
  const changes: UpdateTitleInput = {};
  const text = (value: string) => value.trim() || null;

  if (form.name.trim() !== saved.name) {
    changes.name = form.name.trim();
  }
  if (form.slug.trim() !== saved.slug) {
    changes.slug = form.slug.trim();
  }
  for (const key of [
    'originalName',
    'tagline',
    'synopsis',
    'ageRating',
    'originalLanguage',
  ] as const) {
    if (form[key].trim() !== saved[key]) {
      changes[key] = text(form[key]);
    }
  }
  if (form.releaseYear.trim() !== saved.releaseYear) {
    changes.releaseYear = form.releaseYear.trim() ? Number(form.releaseYear) : null;
  }
  if (form.isFeatured !== saved.isFeatured) {
    changes.isFeatured = form.isFeatured;
  }
  if (form.isPaid !== saved.isPaid) {
    changes.access = form.isPaid ? 'PAID' : 'FREE';
  }
  if ([...form.categoryIds].sort().join() !== saved.categoryIds.join()) {
    changes.categoryIds = form.categoryIds;
  }
  return changes;
}
