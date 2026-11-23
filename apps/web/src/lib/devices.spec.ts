// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { askedAgo, describeKind, formatCodeInput, isCompleteCode, kindLabel } from './devices';

describe('formatCodeInput', () => {
  it('puts the hyphen in and writes capitals', () => {
    expect(formatCodeInput('cdfg')).toBe('CDFG');
    expect(formatCodeInput('cdfgh')).toBe('CDFG-H');
    expect(formatCodeInput('cdfghjkm')).toBe('CDFG-HJKM');
  });

  it('takes a pasted code however it was written', () => {
    expect(formatCodeInput(' cdfg hjkm ')).toBe('CDFG-HJKM');
    expect(formatCodeInput('CDFG-HJKM')).toBe('CDFG-HJKM');
    expect(formatCodeInput('CDFG-HJKM-NPQR')).toBe('CDFG-HJKM');
  });

  it('leaves out what cannot be part of a code', () => {
    // No vowels, and none of 0 1 2 5 8.
    expect(formatCodeInput('a0e1i2o5u8')).toBe('');
    expect(formatCodeInput('C!D?F.G')).toBe('CDFG');
  });

  it('lets the hyphen be deleted without it coming back', () => {
    expect(formatCodeInput('CDFG-')).toBe('CDFG');
  });
});

describe('isCompleteCode', () => {
  it('needs all eight', () => {
    expect(isCompleteCode('CDFG-HJKM')).toBe(true);
    expect(isCompleteCode('cdfghjkm')).toBe(true);
    expect(isCompleteCode('CDFG-HJK')).toBe(false);
    expect(isCompleteCode('')).toBe(false);
  });
});

describe('describing a device', () => {
  it('names the kind', () => {
    expect(kindLabel('TV')).toBe('Television');
    expect(kindLabel('MOBILE')).toBe('Phone');
    expect(kindLabel('OTHER')).toBe('Device');
  });

  it('says what it is in a line', () => {
    expect(
      describeKind({ kind: 'TV', platform: 'android-tv', model: 'Chromecast with Google TV' }),
    ).toBe('Television, Android TV, Chromecast with Google TV');
    expect(describeKind({ kind: 'MOBILE', platform: 'android', model: null })).toBe(
      'Phone, Android',
    );
    // A model that only repeats the platform is left out, an unknown platform shows as it is.
    expect(describeKind({ kind: 'TV', platform: 'roku', model: 'Roku Ultra' })).toBe(
      'Television, Roku',
    );
    expect(describeKind({ kind: 'OTHER', platform: 'set-top-box' })).toBe('Device, set-top-box');
  });

  it('says how long it has been waiting', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    expect(askedAgo('2026-11-23T11:59:40Z', now)).toBe('a moment ago');
    expect(askedAgo('2026-11-23T11:58:50Z', now)).toBe('a minute ago');
    expect(askedAgo('2026-11-23T11:55:00Z', now)).toBe('5 minutes ago');
  });
});
