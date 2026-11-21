// SPDX-License-Identifier: AGPL-3.0-only
import { parsePrice, toPriceText } from './billing';
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
  /** The packages through which plans open the title. */
  packageIds: string[];
  /** Prices as typed, such as "3.99". Empty: not on offer. */
  rentPrice: string;
  buyPrice: string;
  /** Whether no subscription opens the title. */
  purchaseOnly: boolean;
}

export function toForm(title: TitleDetail, currency = 'EUR'): DetailsForm {
  return {
    rentPrice: toPriceText(title.rentAmount, currency),
    buyPrice: toPriceText(title.buyAmount, currency),
    purchaseOnly: title.purchaseOnly,
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
    packageIds: title.packages.map((item) => item.id).sort(),
  };
}

/** What stands in the way of saving the prices of a title, or null. */
export function priceProblem(form: DetailsForm, currency: string): string | null {
  const rent = parsePrice(form.rentPrice, currency);
  const buy = parsePrice(form.buyPrice, currency);
  if (rent === 'invalid' || buy === 'invalid') {
    return `Write prices as numbers, such as ${toPriceText(399, currency)}.`;
  }
  if (form.isPaid && form.purchaseOnly && rent === null && buy === null) {
    return 'Set a price for renting or buying, or nobody could watch the title.';
  }
  return null;
}

/**
 * The fields that differ from what is saved, in the shape the API takes.
 * Prices that cannot be read are left out: priceProblem names them first.
 */
export function changedFields(
  saved: DetailsForm,
  form: DetailsForm,
  currency = 'EUR',
): UpdateTitleInput {
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
  if ([...form.packageIds].sort().join() !== saved.packageIds.join()) {
    changes.packageIds = form.packageIds;
  }
  for (const [text, before, key] of [
    [form.rentPrice, saved.rentPrice, 'rentAmount'],
    [form.buyPrice, saved.buyPrice, 'buyAmount'],
  ] as const) {
    const amount = parsePrice(text, currency);
    if (amount !== 'invalid' && amount !== parsePrice(before, currency)) {
      changes[key] = amount;
    }
  }
  if (form.purchaseOnly !== saved.purchaseOnly) {
    changes.purchaseOnly = form.purchaseOnly;
  }
  return changes;
}
