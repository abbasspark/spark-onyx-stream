// SPDX-License-Identifier: AGPL-3.0-only
import {
  compareVersions,
  parseClient,
  readRules,
  ruleAgainst,
  type AppVersionRule,
} from './app-version.rules.js';

const rule = (app: string, minimum: string): AppVersionRule => ({
  app,
  minimum,
  message: null,
  updateUrl: null,
});

describe('parseClient', () => {
  it('reads the name and the version', () => {
    expect(parseClient('android-tv/1.4.0')).toEqual({ app: 'android-tv', version: '1.4.0' });
    expect(parseClient(' Android/2 ')).toEqual({ app: 'android', version: '2' });
    expect(parseClient(['ios/3.1', 'other/1'])).toEqual({ app: 'ios', version: '3.1' });
  });

  it('ignores what follows the numbers', () => {
    expect(parseClient('android/1.4.0-beta.2')).toEqual({ app: 'android', version: '1.4.0' });
    expect(parseClient('android/1.4.0+417')).toEqual({ app: 'android', version: '1.4.0' });
  });

  it('gives up on anything else', () => {
    for (const header of [
      undefined,
      '',
      'android',
      'android/',
      '/1.0',
      'android/1.x',
      'a/1/2',
      '9lives/1',
      `android/${'1'.repeat(90)}`,
    ]) {
      expect(parseClient(header)).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('compares number by number, not as text', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
    expect(compareVersions('1.4.0.1', '1.4')).toBeGreaterThan(0);
  });
});

describe('ruleAgainst', () => {
  const rules = [rule('android-tv', '1.4.0'), rule('android', '2.0.0')];

  it('turns away what is older than the minimum of its app', () => {
    expect(ruleAgainst({ app: 'android-tv', version: '1.3.9' }, rules)?.minimum).toBe('1.4.0');
    expect(ruleAgainst({ app: 'android-tv', version: '1.4.0' }, rules)).toBeNull();
    expect(ruleAgainst({ app: 'android', version: '1.9' }, rules)?.app).toBe('android');
  });

  it('lets through apps nobody made a rule for', () => {
    expect(ruleAgainst({ app: 'roku', version: '0.1' }, rules)).toBeNull();
  });
});

describe('readRules', () => {
  it('keeps what is sound and drops the rest', () => {
    expect(
      readRules([
        { app: 'android', minimum: '2.0.0', message: 'Please update', updateUrl: '' },
        { app: 'Bad Name', minimum: '1.0' },
        { app: 'ios', minimum: 'soon' },
        null,
        'text',
      ]),
    ).toEqual([{ app: 'android', minimum: '2.0.0', message: 'Please update', updateUrl: null }]);
    expect(readRules(undefined)).toEqual([]);
    expect(readRules({})).toEqual([]);
  });
});
