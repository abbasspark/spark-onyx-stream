// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { ViewerWatchingItem } from '@/api/types';
import {
  describeDevice,
  generatePassword,
  initialsOf,
  profileColor,
  summarizeWatching,
} from './viewers';

describe('describeDevice', () => {
  it('names the browser and the system', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      ),
    ).toBe('Safari on Mac');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone');
    expect(
      describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'),
    ).toBe('Firefox on Linux');
  });

  it('is not fooled by browsers that name the ones they are built on', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Samsung Internet on Android');
  });

  it('falls back to what an app calls itself', () => {
    expect(describeDevice('OnyxTV/2.1 (tvOS 18)')).toBe('OnyxTV');
    expect(describeDevice('curl/8.7.1')).toBe('curl');
    expect(describeDevice(null)).toBe('Unknown device');
    expect(describeDevice('')).toBe('Unknown device');
  });
});

describe('generatePassword', () => {
  it('makes four readable groups without look-alike characters', () => {
    const password = generatePassword();
    expect(password).toMatch(/^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/);
    expect(password).not.toMatch(/[0O1lIio]/);
  });

  it('makes a different one each time', () => {
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });

  it('skips bytes that would favour some letters', () => {
    // 255 is past the last full run of the alphabet and must be ignored.
    let call = 0;
    const password = generatePassword((count) => {
      const bytes = new Uint8Array(count).fill(call === 0 ? 255 : 0);
      call += 1;
      return bytes;
    });
    expect(password).toBe('aaaa-aaaa-aaaa-aaaa');
    expect(call).toBe(2);
  });
});

describe('initialsOf', () => {
  it('takes the first and the last word', () => {
    expect(initialsOf('Anna Berg')).toBe('AB');
    expect(initialsOf('anna maria berg')).toBe('AB');
    expect(initialsOf('  Cleo ')).toBe('C');
    expect(initialsOf('')).toBe('');
  });

  it('keeps letters outside the Latin alphabet whole', () => {
    expect(initialsOf('عباس بندر')).toBe('عب');
  });
});

describe('summarizeWatching', () => {
  const movie: ViewerWatchingItem = {
    id: 'm',
    profile: { id: 'p', name: 'Anna' },
    title: { id: 'm', name: 'Night Train', type: 'MOVIE' },
    episode: null,
    position: 750,
    duration: 3000,
    completedAt: null,
    watchedAt: '2026-11-20T10:00:00.000Z',
  };

  it('says how far a video was watched', () => {
    expect(summarizeWatching(movie)).toEqual({
      episode: null,
      state: '12:30 of 50:00',
      percent: 25,
    });
  });

  it('names the episode', () => {
    const summary = summarizeWatching({
      ...movie,
      episode: { id: 'e', seasonNumber: 2, number: 5, name: 'The Trench' },
    });
    expect(summary.episode).toBe('S2 E5 The Trench');
  });

  it('tells a finished video from one that is watched again', () => {
    const completedAt = '2026-11-19T10:00:00.000Z';
    expect(summarizeWatching({ ...movie, position: 0, completedAt })).toMatchObject({
      state: 'Watched',
      percent: 100,
    });
    expect(summarizeWatching({ ...movie, completedAt })).toMatchObject({
      state: '12:30 of 50:00, watched before',
      percent: 25,
    });
  });
});

describe('profileColor', () => {
  it('draws a known colour, and an unknown one as slate', () => {
    expect(profileColor('amber')).toBe('#e6a85c');
    expect(profileColor('ultraviolet')).toBe(profileColor('slate'));
  });
});
