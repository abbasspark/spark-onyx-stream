// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { Webhook, WebhookDelivery, WebhookEventInfo } from '@/api/types';
import {
  answerOf,
  deliveryOutcome,
  draftOf,
  draftProblem,
  EMPTY_DRAFT,
  eventLabel,
  eventSummary,
  formatDelay,
  groupEvents,
  groupState,
  inputOf,
  isPlainHttp,
  retryWindow,
  successRate,
  summarizeActivity,
  toggleGroup,
  triesOf,
  urlProblem,
  verificationSample,
  webhookHealth,
} from './webhooks';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const event = (name: string, group: string, label: string): WebhookEventInfo => ({
  name,
  group,
  label,
  description: '',
  sample: {},
});
const EVENTS = [
  event('title.published', 'Catalog', 'A title was published'),
  event('title.deleted', 'Catalog', 'A title was deleted'),
  event('viewer.created', 'Viewers', 'A viewer signed up'),
];
const webhook = (changes: Partial<Webhook> = {}): Webhook => ({
  id: 'w1',
  name: 'Automation',
  url: 'https://example.com/hooks',
  events: ['*'],
  isActive: true,
  failingSince: null,
  disabledReason: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  lastDelivery: null,
  recent: { delivered: 0, failed: 0, pending: 0 },
  ...changes,
});
const delivery = (changes: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  id: 'd1',
  event: 'title.published',
  status: 'PENDING',
  attempts: 0,
  maxAttempts: 7,
  nextAttemptAt: null,
  responseStatus: null,
  error: null,
  durationMs: null,
  createdAt: '2026-11-23T11:59:00Z',
  attemptedAt: null,
  deliveredAt: null,
  ...changes,
});

describe('webhookHealth', () => {
  it('waits for the first delivery', () => {
    expect(webhookHealth(webhook(), NOW)).toMatchObject({ state: 'waiting', tone: 'info' });
  });

  it('is healthy after a delivery got through', () => {
    const health = webhookHealth(
      webhook({
        lastDelivery: { status: 'DELIVERED', at: '2026-11-23T11:55:00Z', event: 'title.published' },
      }),
      NOW,
    );
    expect(health).toMatchObject({ state: 'healthy', tone: 'success' });
    expect(health.detail).toContain('5 minutes ago');
  });

  it('says since when it fails', () => {
    const health = webhookHealth(webhook({ failingSince: '2026-11-23T10:00:00Z' }), NOW);
    expect(health).toMatchObject({ state: 'failing', tone: 'warning' });
    expect(health.detail).toContain('Nothing got through for 2 hours.');
  });

  it('tells switched off by an admin from stopped by the system', () => {
    expect(webhookHealth(webhook({ isActive: false }), NOW).state).toBe('off');
    expect(
      webhookHealth(webhook({ isActive: false, disabledReason: 'Failed for three days' }), NOW),
    ).toMatchObject({ state: 'stopped', tone: 'danger', detail: 'Failed for three days' });
  });
});

describe('events', () => {
  it('names them, also the test and ones it does not know', () => {
    expect(eventLabel('viewer.created', EVENTS)).toBe('A viewer signed up');
    expect(eventLabel('webhook.test', EVENTS)).toBe('Test');
    expect(eventLabel('future.event', EVENTS)).toBe('future.event');
  });

  it('sums up what a webhook listens to', () => {
    expect(eventSummary(['*'], EVENTS)).toBe('Everything');
    expect(eventSummary(['title.deleted'], EVENTS)).toBe('A title was deleted');
    expect(eventSummary(['title.deleted', 'viewer.created'], EVENTS)).toBe('2 events');
  });

  it('groups them in the order they come', () => {
    expect(groupEvents(EVENTS).map((group) => [group.name, group.events.length])).toEqual([
      ['Catalog', 2],
      ['Viewers', 1],
    ]);
  });

  it('chooses a whole group and lets go of it again', () => {
    const [catalog] = groupEvents(EVENTS) as [ReturnType<typeof groupEvents>[number]];
    expect(groupState(catalog, new Set())).toBe(false);
    const some = new Set(['title.deleted', 'viewer.created']);
    expect(groupState(catalog, some)).toBe('indeterminate');
    const all = toggleGroup(catalog, some);
    expect(groupState(catalog, all)).toBe(true);
    expect([...toggleGroup(catalog, all)]).toEqual(['viewer.created']);
  });
});

describe('the form', () => {
  it('reads a webhook into a draft and back', () => {
    expect(draftOf(webhook())).toMatchObject({ everything: true, events: new Set() });
    const draft = draftOf(webhook({ events: ['viewer.created', 'title.published', 'new.one'] }));
    expect(draft.everything).toBe(false);
    expect(inputOf({ ...draft, name: ' Automation ' }, EVENTS)).toEqual({
      name: 'Automation',
      url: 'https://example.com/hooks',
      events: ['title.published', 'viewer.created', 'new.one'],
    });
    expect(inputOf({ ...draft, everything: true }, EVENTS).events).toEqual(['*']);
  });

  it('catches slips in the address', () => {
    expect(urlProblem('')).toBeNull();
    expect(urlProblem('https://example.com/hook?x=1')).toBeNull();
    expect(urlProblem('example.com/hook')).toMatch(/full address/);
    expect(urlProblem('ftp://example.com')).toMatch(/https/);
    expect(urlProblem('https://me:pw@example.com')).toMatch(/password/);
    expect(isPlainHttp(' HTTP://10.0.0.5/hook')).toBe(true);
    expect(isPlainHttp('https://example.com')).toBe(false);
  });

  it('says what is missing, one thing at a time', () => {
    expect(draftProblem(EMPTY_DRAFT)).toMatch(/name/);
    expect(draftProblem({ ...EMPTY_DRAFT, name: 'A' })).toMatch(/address/);
    const filled = { ...EMPTY_DRAFT, name: 'A', url: 'https://example.com' };
    expect(draftProblem(filled)).toMatch(/at least one event/);
    expect(draftProblem({ ...filled, everything: true })).toBeNull();
    expect(draftProblem({ ...filled, events: new Set(['title.deleted']) })).toBeNull();
  });
});

describe('retries', () => {
  it('writes delays short', () => {
    expect([45, 60, 1800, 7200, 5400].map(formatDelay)).toEqual([
      '45 s',
      '1 min',
      '30 min',
      '2 h',
      '1.5 h',
    ]);
  });

  it('adds up how long it keeps trying', () => {
    expect(retryWindow([60, 300, 1800, 7200, 21600, 43200])).toBe('about 21 hours');
    expect(retryWindow([60, 300])).toBe('about 6 minutes');
    expect(retryWindow([3600])).toBe('about an hour');
  });
});

describe('deliveries', () => {
  it('says what became of one', () => {
    expect(deliveryOutcome(delivery())).toMatchObject({ label: 'Queued', live: true });
    expect(deliveryOutcome(delivery({ attempts: 2 }))).toMatchObject({
      label: 'Trying again',
      tone: 'warning',
    });
    expect(deliveryOutcome(delivery({ status: 'DELIVERED', attempts: 1 })).tone).toBe('success');
    expect(deliveryOutcome(delivery({ status: 'FAILED', attempts: 7 })).tone).toBe('danger');
  });

  it('shows the answer short', () => {
    expect(answerOf(delivery())).toBe('—');
    expect(answerOf(delivery({ attempts: 1 }))).toBe('No answer');
    expect(answerOf(delivery({ attempts: 1, responseStatus: 503 }))).toBe('503');
  });

  it('counts tries and says when the next one comes', () => {
    expect(triesOf(delivery(), NOW)).toBe('Not tried yet');
    expect(triesOf(delivery({ status: 'DELIVERED', attempts: 1 }), NOW)).toBe('Try 1 of 7');
    const waiting = (nextAttemptAt: string) =>
      triesOf(delivery({ attempts: 2, nextAttemptAt }), NOW);
    expect(waiting('2026-11-23T12:00:40Z')).toBe('Try 2 of 7, next one in 40 s');
    expect(waiting('2026-11-23T12:04:10Z')).toBe('Try 2 of 7, next one in 4 min');
    expect(waiting('2026-11-23T18:00:00Z')).toBe('Try 2 of 7, next one in 6 h');
    expect(waiting('2026-11-23T11:59:59Z')).toBe('Try 2 of 7, next one now');
  });

  it('works out the share that got through', () => {
    expect(successRate({ delivered: 0, failed: 0, pending: 3 })).toBeNull();
    expect(successRate({ delivered: 9, failed: 1, pending: 5 })).toBe(90);
  });

  it('sums up the hours of a day', () => {
    const hour = (delivered: number, failed: number, pending = 0) => ({
      start: '2026-11-23T11:00:00Z',
      delivered,
      failed,
      pending,
    });
    expect(summarizeActivity([hour(0, 0), hour(4, 1, 2), hour(3, 0)])).toEqual({
      total: 10,
      delivered: 7,
      failed: 1,
      pending: 2,
      peak: 7,
    });
    expect(summarizeActivity([]).peak).toBe(1);
  });
});

describe('verificationSample', () => {
  it('carries the tolerance and the header names in every language', () => {
    for (const language of ['node', 'python', 'php'] as const) {
      const code = verificationSample(language, 300);
      expect(code).toContain('300');
      expect(code.toLowerCase()).toMatch(/x[-_]onyx[-_]signature/);
      expect(code).toContain('v1=');
    }
  });
});
