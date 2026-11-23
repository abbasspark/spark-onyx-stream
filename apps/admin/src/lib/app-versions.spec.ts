// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { AppVersionRule } from '@/api/types';
import {
  appLabel,
  appNameProblem,
  compareVersions,
  draftOf,
  draftProblem,
  EMPTY_RULE,
  linkProblem,
  OTHER_APP,
  refusalExample,
  ruleOf,
  STANDARD_MESSAGE,
  versionProblem,
  withRule,
} from './app-versions';

const rule = (
  app: string,
  minimum: string,
  more: Partial<AppVersionRule> = {},
): AppVersionRule => ({
  app,
  minimum,
  message: null,
  updateUrl: null,
  ...more,
});

describe('names and versions', () => {
  it('labels the apps it knows and leaves the others as they are', () => {
    expect(appLabel('android-tv')).toBe('Android TV');
    expect(appLabel('set-top-box')).toBe('set-top-box');
  });

  it('checks what is typed', () => {
    expect(appNameProblem('set-top-box')).toBeNull();
    expect(appNameProblem(' Fire-TV ')).toBeNull();
    expect(appNameProblem('')).toMatch(/Enter/);
    expect(appNameProblem('my app')).toMatch(/lower-case/);
    expect(versionProblem('1.4.0')).toBeNull();
    expect(versionProblem('2')).toBeNull();
    expect(versionProblem('v1.4')).toMatch(/numbers with dots/);
    expect(versionProblem('1.4.0-beta')).toMatch(/numbers with dots/);
    expect(linkProblem('')).toBeNull();
    expect(linkProblem('market://details?id=tv.example')).toBeNull();
    expect(linkProblem('play store')).toMatch(/full address/);
  });

  it('compares versions number by number', () => {
    expect(compareVersions('1.9', '1.10')).toBeLessThan(0);
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
  });
});

describe('the form', () => {
  const rules = [rule('android-tv', '1.4.0'), rule('set-top-box', '3.0')];

  it('reads a rule into a draft and back', () => {
    const known = draftOf(rule('android-tv', '1.4.0', { message: 'Please update' }));
    expect(known).toMatchObject({ choice: 'android-tv', custom: '', message: 'Please update' });
    const other = draftOf(rules[1] as AppVersionRule);
    expect(other).toMatchObject({ choice: OTHER_APP, custom: 'set-top-box' });
    expect(ruleOf({ ...other, custom: ' Set-Top-Box ', minimum: ' 3.1 ', updateUrl: ' ' })).toEqual(
      rule('set-top-box', '3.1'),
    );
  });

  it('says what is missing, one thing at a time', () => {
    expect(draftProblem(EMPTY_RULE, rules, null)).toBe('Choose the app');
    const draft = { ...EMPTY_RULE, choice: 'ios' };
    expect(draftProblem(draft, rules, null)).toBe('Enter a version');
    expect(draftProblem({ ...draft, minimum: '2.0' }, rules, null)).toBeNull();
    expect(draftProblem({ ...draft, minimum: '2.0', updateUrl: 'store' }, rules, null)).toMatch(
      /full address/,
    );
    expect(draftProblem({ ...EMPTY_RULE, choice: OTHER_APP, minimum: '1' }, rules, null)).toMatch(
      /Enter the name/,
    );
  });

  it('allows one rule per app, and lets a rule keep its own app', () => {
    const again = { ...EMPTY_RULE, choice: 'android-tv', minimum: '2.0' };
    expect(draftProblem(again, rules, null)).toBe('Android TV has a rule already');
    expect(draftProblem(again, rules, 'android-tv')).toBeNull();
  });

  it('adds a rule, or puts it in the place of the one it replaces', () => {
    expect(withRule(rules, rule('ios', '2.0'), null).map((entry) => entry.app)).toEqual([
      'android-tv',
      'set-top-box',
      'ios',
    ]);
    expect(withRule(rules, rule('android-tv', '2.0'), 'android-tv')).toEqual([
      rule('set-top-box', '3.0'),
      rule('android-tv', '2.0'),
    ]);
    // Renamed: the old name goes.
    expect(withRule(rules, rule('roku', '1.0'), 'set-top-box').map((entry) => entry.app)).toEqual([
      'android-tv',
      'roku',
    ]);
  });
});

describe('refusalExample', () => {
  it('shows what an old app gets back', () => {
    expect(refusalExample(rule('ios', '2.0', { message: 'Update, please.' }))).toMatchObject({
      statusCode: 426,
      code: 'client_too_old',
      minimumVersion: '2.0',
      message: 'Update, please.',
    });
    expect(refusalExample(undefined).message).toBe(STANDARD_MESSAGE);
  });
});
