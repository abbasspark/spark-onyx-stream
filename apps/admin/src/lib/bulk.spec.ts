// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { BulkResult, TranslationJob } from '@/api/types';
import {
  counted,
  describeOutcome,
  isActiveJob,
  jobCounts,
  jobPercent,
  jobTimeLeft,
  rangeOf,
} from './bulk';

const MOVIES = { one: 'movie', many: 'movies' };
const result = (values: Partial<BulkResult>): BulkResult => ({
  action: 'publish',
  matched: 0,
  changed: 0,
  unchanged: 0,
  failed: 0,
  failures: [],
  job: null,
  ...values,
});

describe('counted', () => {
  it('uses the word for one or for many', () => {
    expect(counted(1, MOVIES)).toBe('1 movie');
    expect(counted(1240, MOVIES)).toBe('1,240 movies');
    expect(counted(2, { one: 'series', many: 'series' })).toBe('2 series');
  });
});

describe('describeOutcome', () => {
  it('says what was done when all went well', () => {
    expect(describeOutcome(result({ matched: 3, changed: 3 }), MOVIES)).toEqual({
      tone: 'success',
      message: 'Published 3 movies',
    });
  });

  it('counts what was as asked already and what failed', () => {
    expect(
      describeOutcome(result({ matched: 6, changed: 3, unchanged: 1, failed: 2 }), MOVIES),
    ).toEqual({
      tone: 'warning',
      message: 'Published 3 movies · 1 was published already · 2 could not be published',
    });
  });

  it('is an error when nothing could be done', () => {
    expect(describeOutcome(result({ action: 'delete', matched: 2, failed: 2 }), MOVIES)).toEqual({
      tone: 'error',
      message: '2 could not be deleted',
    });
  });

  it('says so when there was nothing to do', () => {
    expect(
      describeOutcome(result({ action: 'archive', matched: 2, unchanged: 2 }), MOVIES).message,
    ).toBe('Nothing to do: 2 were archived already');
    expect(describeOutcome(result({}), MOVIES).tone).toBe('warning');
  });

  it('names the shelf that changed', () => {
    expect(
      describeOutcome(result({ action: 'genres', matched: 1, changed: 1 }), MOVIES).message,
    ).toBe('Changed the genres of 1 movie');
  });

  it('tells that a translation goes on in the background', () => {
    expect(describeOutcome(result({ action: 'translate', matched: 240 }), MOVIES).message).toBe(
      'Translating 240 movies in the background',
    );
  });
});

describe('translation jobs', () => {
  const job = (values: Partial<TranslationJob>) =>
    ({
      status: 'RUNNING',
      total: 100,
      done: 0,
      translated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      startedAt: null,
      ...values,
    }) as TranslationJob;

  it('are active while waiting or running', () => {
    expect(isActiveJob(job({ status: 'QUEUED' }))).toBe(true);
    expect(isActiveJob(job({ status: 'RUNNING' }))).toBe(true);
    expect(isActiveJob(job({ status: 'CANCELLED' }))).toBe(false);
  });

  it('show how far they are', () => {
    expect(jobPercent(job({ done: 25 }))).toBe(25);
    expect(jobPercent(job({ done: 1, total: 3 }))).toBe(33);
    expect(jobPercent(job({ total: 0 }))).toBe(100);
  });

  it('count without the zeros', () => {
    expect(jobCounts(job({ translated: 9, unchanged: 2, skipped: 1, failed: 1 }))).toBe(
      '9 translated · 2 had nothing new · 1 not imported from TMDB · 1 failed',
    );
    expect(jobCounts(job({ translated: 1200 }))).toBe('1,200 translated');
    expect(jobCounts(job({}))).toBe('');
  });

  it('guess the time left from the pace', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const now = new Date('2026-01-01T00:01:00.000Z').getTime();
    expect(jobTimeLeft(job({ done: 50, startedAt }), now)).toBe('about 1 min left');
    expect(jobTimeLeft(job({ done: 90, startedAt }), now)).toBe('under a minute left');
    expect(jobTimeLeft(job({ done: 5, total: 5000, startedAt }), now)).toBe('about 16.7 h left');
    expect(jobTimeLeft(job({ done: 1, startedAt }), now)).toBeNull();
    expect(jobTimeLeft(job({ status: 'QUEUED', done: 50, startedAt }), now)).toBeNull();
  });
});

describe('rangeOf', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('takes everything between two cards, in either direction', () => {
    expect(rangeOf(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeOf(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
  it('takes only the clicked card without a start on this page', () => {
    expect(rangeOf(ids, null, 'c')).toEqual(['c']);
    expect(rangeOf(ids, 'z', 'c')).toEqual(['c']);
  });
});
