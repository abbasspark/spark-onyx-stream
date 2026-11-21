// SPDX-License-Identifier: AGPL-3.0-only
import { authHref, describeDevice, formatDay, safeNextPath, toViewerApiError } from './viewer-api';

describe('safeNextPath', () => {
  it('accepts a path on this site', () => {
    expect(safeNextPath('/watch/night-train')).toBe('/watch/night-train');
    expect(safeNextPath('/browse?type=SERIES&page=2')).toBe('/browse?type=SERIES&page=2');
  });

  it('refuses anything that could lead to another site', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example/path')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
    expect(safeNextPath('watch/night-train')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });

  it('does not lead back to the sign-in pages', () => {
    expect(safeNextPath('/sign-in')).toBe('/');
    expect(safeNextPath('/sign-up?next=/account')).toBe('/');
    expect(safeNextPath('/sign-insider')).toBe('/sign-insider');
  });
});

describe('authHref', () => {
  it('carries the way back, and leaves it out for the home page', () => {
    expect(authHref('sign-in', '/watch/night-train?trailer=1')).toBe(
      '/sign-in?next=%2Fwatch%2Fnight-train%3Ftrailer%3D1',
    );
    expect(authHref('sign-up', '/')).toBe('/sign-up');
    expect(authHref('sign-up', 'https://evil.example')).toBe('/sign-up');
  });
});

describe('toViewerApiError', () => {
  it('says how long to wait when there were too many attempts', () => {
    expect(toViewerApiError(429, { retryAfterSeconds: 840 }).message).toBe(
      'Too many attempts. Try again in 14 minutes.',
    );
    expect(toViewerApiError(429, { retryAfterSeconds: 30 }).message).toContain('1 minute.');
    expect(toViewerApiError(429, null).message).toContain('a little while');
  });

  it('keeps one message per field for a form', () => {
    const error = toViewerApiError(400, {
      message: 'Validation failed',
      issues: [
        { field: 'password', message: 'Password must be at least 8 characters' },
        { field: 'password', message: 'Another problem' },
        { field: 'email', message: 'Enter a valid email address' },
      ],
    });
    expect(error.fields).toEqual({
      password: 'Password must be at least 8 characters',
      email: 'Enter a valid email address',
    });
    expect(error.message).toBe('Password must be at least 8 characters');
  });

  it('uses the message of the API, or a general one', () => {
    expect(toViewerApiError(401, { message: 'Email or password is incorrect' }).message).toBe(
      'Email or password is incorrect',
    );
    expect(toViewerApiError(500, null).message).toContain('Something went wrong');
  });
});

describe('describeDevice', () => {
  it('names browser and system, or what an app calls itself', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(describeDevice('OnyxTV/2.1 (tvOS 18)')).toBe('OnyxTV');
    expect(describeDevice(null)).toBe('Unknown device');
  });
});

describe('formatDay', () => {
  const now = new Date(2026, 10, 21, 9, 0);

  it('uses words for the last week and the date before that', () => {
    expect(formatDay(new Date(2026, 10, 21, 0, 5).toISOString(), now)).toBe('today');
    expect(formatDay(new Date(2026, 10, 20, 23, 55).toISOString(), now)).toBe('yesterday');
    expect(formatDay(new Date(2026, 10, 16, 12, 0).toISOString(), now)).toBe('5 days ago');
    expect(formatDay(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe('October 1, 2026');
  });
});
