// SPDX-License-Identifier: AGPL-3.0-only
import { ALL_EVENTS, isWebhookEvent, listensTo, WEBHOOK_EVENT_LIST } from './webhook-events.js';
import { isSuccess, MAX_ATTEMPTS, nextAttemptAfter, shouldDisable } from './webhook-retry.js';
import { generateWebhookSecret, signWebhook, verifyWebhook } from './webhook-signature.js';
import {
  addressProblem,
  isForbiddenAddress,
  isPrivateAddress,
  urlProblem,
} from './webhook-target.js';

describe('events', () => {
  it('have unique names of the form thing.happened, and an example each', () => {
    const names = WEBHOOK_EVENT_LIST.map((event) => event.name);
    expect(new Set(names).size).toBe(names.length);
    for (const event of WEBHOOK_EVENT_LIST) {
      expect(event.name).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(Object.keys(event.sample).length).toBeGreaterThan(0);
    }
    expect(isWebhookEvent('title.published')).toBe(true);
    expect(isWebhookEvent('title.exploded')).toBe(false);
  });

  it('reach a webhook that asked for them, or for all', () => {
    expect(listensTo(['title.published'], 'title.published')).toBe(true);
    expect(listensTo(['title.published'], 'viewer.created')).toBe(false);
    expect(listensTo([ALL_EVENTS], 'viewer.created')).toBe(true);
    expect(listensTo([], 'viewer.created')).toBe(false);
  });
});

describe('signature', () => {
  const secret = 'whsec_test';
  const body = '{"id":"1","event":"title.published"}';

  it('makes secrets that are recognizable and long', () => {
    const made = generateWebhookSecret();
    expect(made).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generateWebhookSecret()).not.toBe(made);
  });

  it('is the HMAC-SHA256 of timestamp, a dot and the body', () => {
    // Worked out independently with:
    // echo -n '1700000000.{"id":"1","event":"title.published"}' | openssl dgst -sha256 -hmac whsec_test
    expect(signWebhook(secret, 1_700_000_000, body)).toBe(
      'v1=790e27b0f624904a4d2870af6067de91e2ead8d9a6998e6afb1e2372ecefff05',
    );
  });

  it('verifies what it signed, and nothing else', () => {
    const signature = signWebhook(secret, 1_700_000_000, body);
    expect(verifyWebhook(secret, 1_700_000_000, body, signature, 1_700_000_010)).toBe(true);
    expect(verifyWebhook('whsec_other', 1_700_000_000, body, signature, 1_700_000_010)).toBe(false);
    expect(verifyWebhook(secret, 1_700_000_000, `${body} `, signature, 1_700_000_010)).toBe(false);
    expect(verifyWebhook(secret, 1_700_000_001, body, signature, 1_700_000_010)).toBe(false);
    expect(verifyWebhook(secret, 1_700_000_000, body, 'v1=short', 1_700_000_010)).toBe(false);
  });

  it('refuses a request that is too old', () => {
    const signature = signWebhook(secret, 1_700_000_000, body);
    expect(verifyWebhook(secret, 1_700_000_000, body, signature, 1_700_000_301)).toBe(false);
  });
});

describe('targets', () => {
  it('never sends to where machines keep their credentials', () => {
    for (const address of [
      '169.254.169.254',
      '0.0.0.0',
      'fe80::1',
      '::ffff:169.254.169.254',
      '::',
    ]) {
      expect(isForbiddenAddress(address), address).toBe(true);
      expect(addressProblem(address, 'any')).not.toBeNull();
    }
    expect(isForbiddenAddress('93.184.216.34')).toBe(false);
  });

  it('knows private and local addresses, and sends to them unless told otherwise', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.10',
      '::1',
      'fd12::1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
      expect(addressProblem(address, 'any')).toBeNull();
      expect(addressProblem(address, 'public')).toMatch(/WEBHOOK_TARGETS/);
    }
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(addressProblem('93.184.216.34', 'public')).toBeNull();
  });

  it('checks an address as it is typed', () => {
    expect(urlProblem('https://example.com/hooks/onyx', 'public')).toBeNull();
    expect(urlProblem('http://192.168.1.10:5678/webhook', 'any')).toBeNull();
    expect(urlProblem('example.com/hook', 'any')).toMatch(/full address/);
    expect(urlProblem('ftp://example.com/hook', 'any')).toMatch(/https/);
    expect(urlProblem('https://user:pw@example.com/hook', 'any')).toMatch(/password/);
    expect(urlProblem('http://169.254.169.254/latest/meta-data', 'any')).toMatch(/reserved/);
    expect(urlProblem('http://[fe80::1]/x', 'any')).toMatch(/reserved/);
    expect(urlProblem('http://localhost:5678/x', 'public')).toMatch(/WEBHOOK_TARGETS/);
    expect(urlProblem('http://localhost:5678/x', 'any')).toBeNull();
  });
});

describe('retries', () => {
  const now = new Date('2026-11-23T12:00:00Z');

  it('waits longer each time, and gives up after the seventh try', () => {
    expect(nextAttemptAfter(1, now)).toEqual(new Date('2026-11-23T12:01:00Z'));
    expect(nextAttemptAfter(2, now)).toEqual(new Date('2026-11-23T12:05:00Z'));
    expect(nextAttemptAfter(MAX_ATTEMPTS - 1, now)).toEqual(new Date('2026-11-24T00:00:00Z'));
    expect(nextAttemptAfter(MAX_ATTEMPTS, now)).toBeNull();
    expect(MAX_ATTEMPTS).toBe(7);
  });

  it('switches a webhook off after three days of nothing getting through', () => {
    expect(shouldDisable(null, now)).toBe(false);
    expect(shouldDisable(new Date('2026-11-21T12:00:00Z'), now)).toBe(false);
    expect(shouldDisable(new Date('2026-11-20T12:00:00Z'), now)).toBe(true);
  });

  it('counts only 2xx as success', () => {
    expect(isSuccess(200)).toBe(true);
    expect(isSuccess(204)).toBe(true);
    expect(isSuccess(302)).toBe(false);
    expect(isSuccess(500)).toBe(false);
  });
});
