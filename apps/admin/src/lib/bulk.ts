// SPDX-License-Identifier: AGPL-3.0-only
import type { BulkAction, BulkResult, TranslationJob } from '@/api/types';

/** The most titles that can be chosen one by one. Beyond it, "all that match" is the way. */
export const MAX_CHOSEN = 500;
/** The most titles one action changes. */
export const MAX_TITLES = 5000;

type Kind = BulkAction['type'];

/** How each action is told once it is done: what happened, and what did not. */
const WORDS: Record<Exclude<Kind, 'translate'>, { done: string; already: string; not: string }> = {
  publish: { done: 'Published', already: 'published already', not: 'published' },
  unpublish: { done: 'Unpublished', already: 'drafts already', not: 'unpublished' },
  archive: { done: 'Archived', already: 'archived already', not: 'archived' },
  delete: { done: 'Deleted', already: 'gone already', not: 'deleted' },
  feature: { done: 'Changed', already: 'as asked already', not: 'changed' },
  age: { done: 'Set the age of', already: 'as asked already', not: 'changed' },
  categories: { done: 'Changed the categories of', already: 'as asked already', not: 'changed' },
  genres: { done: 'Changed the genres of', already: 'as asked already', not: 'changed' },
  collections: { done: 'Changed the collections of', already: 'as asked already', not: 'changed' },
  availability: { done: 'Set the dates of', already: 'as asked already', not: 'changed' },
};

export interface Nouns {
  one: string;
  many: string;
}

export const counted = (count: number, nouns: Nouns): string =>
  `${count.toLocaleString('en')} ${count === 1 ? nouns.one : nouns.many}`;

export interface Outcome {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

/**
 * One sentence for the result of an action: what was done to how many, and
 * what could not be done. The tone says whether to look closer.
 */
export function describeOutcome(result: BulkResult, nouns: Nouns): Outcome {
  if (result.action === 'translate') {
    return {
      tone: result.matched > 0 ? 'success' : 'warning',
      message:
        result.matched > 0
          ? `Translating ${counted(result.matched, nouns)} in the background`
          : 'Nothing was selected',
    };
  }
  const words = WORDS[result.action];
  if (result.matched === 0) {
    return { tone: 'warning', message: 'Nothing matched, so nothing was changed' };
  }
  const parts: string[] = [];
  if (result.changed > 0) {
    parts.push(`${words.done} ${counted(result.changed, nouns)}`);
  }
  if (result.unchanged > 0) {
    parts.push(
      `${result.unchanged.toLocaleString('en')} ${result.unchanged === 1 ? 'was' : 'were'} ${words.already}`,
    );
  }
  if (result.failed > 0) {
    parts.push(`${result.failed.toLocaleString('en')} could not be ${words.not}`);
  }
  const message = parts.join(' · ');
  if (result.failed > 0) {
    return { tone: result.changed > 0 ? 'warning' : 'error', message };
  }
  return { tone: 'success', message: result.changed > 0 ? message : `Nothing to do: ${message}` };
}

/** True while a job has work left. */
export const isActiveJob = (job: Pick<TranslationJob, 'status'>): boolean =>
  job.status === 'QUEUED' || job.status === 'RUNNING';

/** How far a job is, from 0 to 100. A job without titles is done. */
export function jobPercent(job: Pick<TranslationJob, 'done' | 'total'>): number {
  if (job.total <= 0) {
    return 100;
  }
  return Math.min(100, Math.max(0, Math.round((job.done / job.total) * 100)));
}

/** "9 translated · 2 had nothing new · 1 not imported · 1 failed", without the zeros. */
export function jobCounts(
  job: Pick<TranslationJob, 'translated' | 'unchanged' | 'skipped' | 'failed'>,
): string {
  const parts = [
    job.translated > 0 ? `${job.translated.toLocaleString('en')} translated` : null,
    job.unchanged > 0 ? `${job.unchanged.toLocaleString('en')} had nothing new` : null,
    job.skipped > 0 ? `${job.skipped.toLocaleString('en')} not imported from TMDB` : null,
    job.failed > 0 ? `${job.failed.toLocaleString('en')} failed` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/** How long is left, guessed from the pace so far. Null while there is nothing to go by. */
export function jobTimeLeft(
  job: Pick<TranslationJob, 'done' | 'total' | 'startedAt' | 'status'>,
  now: number,
): string | null {
  if (job.status !== 'RUNNING' || !job.startedAt || job.done < 3 || job.done >= job.total) {
    return null;
  }
  const elapsed = now - new Date(job.startedAt).getTime();
  if (!(elapsed > 0)) {
    return null;
  }
  const seconds = Math.round(((elapsed / job.done) * (job.total - job.done)) / 1000);
  if (seconds < 60) {
    return 'under a minute left';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `about ${minutes} min left`;
  }
  const hours = Math.round(minutes / 6) / 10;
  return `about ${hours} h left`;
}

/**
 * The ids between two cards of a page, both included, for a click with Shift.
 * When one of them is not on the page, only the clicked one.
 */
export function rangeOf(ids: readonly string[], from: string | null, to: string): string[] {
  const end = ids.indexOf(to);
  const start = from === null ? -1 : ids.indexOf(from);
  if (end === -1 || start === -1) {
    return [to];
  }
  return ids.slice(Math.min(start, end), Math.max(start, end) + 1);
}
