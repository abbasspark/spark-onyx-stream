// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { Campaign } from '@/api/types';
import {
  audienceLabel,
  emptyForm,
  formOf,
  formProblem,
  platformLabel,
  reachSentence,
  shareOf,
  toInput,
  toLocalInput,
} from './notifications';

const now = new Date(2026, 11, 10, 14, 25);

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    title: 'Glass Tide is here',
    body: 'From tonight.',
    linked: null,
    link: null,
    audience: 'EVERYONE',
    plan: null,
    status: 'DRAFT',
    scheduledAt: null,
    sentAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    recipients: 0,
    pushed: 0,
    read: 0,
    opened: 0,
    waiting: 0,
    ...over,
  };
}

describe('the form of a message', () => {
  it('starts empty, with the next full hour as the time for later', () => {
    const form = emptyForm(now);
    expect(form).toMatchObject({ linkKind: 'none', audience: 'EVERYONE', when: 'now' });
    expect(form.at).toBe('2026-12-10T15:00');
    expect(toLocalInput(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('is read from a message, and written back the same', () => {
    const later = new Date(2026, 11, 24, 20, 0);
    const form = formOf(
      campaign({
        linked: {
          id: 't1',
          slug: 'glass-tide',
          name: 'Glass Tide',
          type: 'MOVIE',
          status: 'PUBLISHED',
        },
        audience: 'PLAN',
        plan: { id: 'p1', name: 'Premium' },
        scheduledAt: later.toISOString(),
      }),
      now,
    );
    expect(form).toMatchObject({
      linkKind: 'title',
      linked: { id: 't1', name: 'Glass Tide' },
      audience: 'PLAN',
      planId: 'p1',
      when: 'later',
      at: '2026-12-24T20:00',
    });
    expect(toInput(form)).toEqual({
      title: 'Glass Tide is here',
      body: 'From tonight.',
      titleId: 't1',
      link: null,
      audience: 'PLAN',
      planId: 'p1',
      scheduledAt: later.toISOString(),
    });
  });

  it('treats a time that has passed as "now"', () => {
    const form = formOf(campaign({ scheduledAt: new Date(2026, 11, 1).toISOString() }), now);
    expect(form.when).toBe('now');
    expect(toInput(form).scheduledAt).toBeNull();
  });

  it('sends only what the chosen kind of link needs', () => {
    const form = { ...emptyForm(now), title: ' a ', body: ' b ', link: '/plans', planId: 'p1' };
    expect(toInput(form)).toMatchObject({ title: 'a', body: 'b', link: null, planId: null });
    expect(toInput({ ...form, linkKind: 'page' }).link).toBe('/plans');
  });
});

describe('formProblem', () => {
  const good = { ...emptyForm(now), title: 'Headline', body: 'Text' };

  it('finds nothing wrong with a headline and a text', () => {
    expect(formProblem(good, now)).toBeNull();
  });

  it('asks for what is missing, one thing at a time', () => {
    expect(formProblem({ ...good, title: ' ' }, now)).toContain('headline');
    expect(formProblem({ ...good, body: '' }, now)).toContain('what the message says');
    expect(formProblem({ ...good, title: 'x'.repeat(81) }, now)).toContain('longer than 80');
    expect(formProblem({ ...good, linkKind: 'title' }, now)).toContain('Choose the title');
    expect(formProblem({ ...good, audience: 'PLAN' }, now)).toBe('Choose the plan.');
  });

  it('takes only paths of the website as a page', () => {
    for (const link of ['plans', 'https://evil.example.com', '//evil.example.com', '/a b', '']) {
      expect(formProblem({ ...good, linkKind: 'page', link }, now)).toContain('starts with "/"');
    }
    expect(formProblem({ ...good, linkKind: 'page', link: '/plans?from=push' }, now)).toBeNull();
  });

  it('does not schedule into the past', () => {
    expect(formProblem({ ...good, when: 'later', at: '2026-12-10T14:00' }, now)).toContain('past');
    expect(formProblem({ ...good, when: 'later', at: '' }, now)).toContain('Say when');
    expect(formProblem({ ...good, when: 'later', at: '2026-12-10T15:00' }, now)).toBeNull();
  });
});

describe('words', () => {
  it('names an audience', () => {
    expect(audienceLabel(campaign())).toBe('Everyone');
    expect(audienceLabel(campaign({ audience: 'PLAN', plan: { id: 'p', name: 'Premium' } }))).toBe(
      'Subscribers of Premium',
    );
    expect(audienceLabel(campaign({ audience: 'PLAN' }))).toBe(
      'Subscribers of a plan that is gone',
    );
  });

  it('names kinds of device, and shows an unknown one as sent', () => {
    expect(platformLabel('android-tv')).toBe('Android TV');
    expect(platformLabel('roku')).toBe('roku');
  });

  it('writes shares and reach', () => {
    expect(shareOf(31, 50)).toBe('62 %');
    expect(shareOf(0, 0)).toBe('–');
    expect(reachSentence({ viewers: 0, withDevice: 0 })).toContain('Nobody');
    expect(reachSentence({ viewers: 1, withDevice: 0 })).toContain('1 viewer. None has a device');
    expect(reachSentence({ viewers: 1204, withDevice: 380 })).toContain(
      '1,204 viewers, 380 of them on a device',
    );
  });
});
