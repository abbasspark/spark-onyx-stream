// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Webhook,
  WebhookActivityHour,
  WebhookDelivery,
  WebhookEventInfo,
  WebhookInput,
} from '@/api/types';
import type { BadgeTone } from '@/components/ui/display';
import { formatRelative } from './format';

/** Stands for every event, also those added in later versions. */
export const ALL_EVENTS = '*';
/** The event of the "Send a test" button. */
export const TEST_EVENT = 'webhook.test';

export type WebhookState = 'waiting' | 'healthy' | 'failing' | 'off' | 'stopped';

export interface WebhookHealth {
  state: WebhookState;
  label: string;
  tone: BadgeTone;
  /** One sentence that says what is going on. */
  detail: string;
}

/** How a webhook is doing, in a word and a sentence. */
export function webhookHealth(webhook: Webhook, now: number = Date.now()): WebhookHealth {
  if (!webhook.isActive) {
    return webhook.disabledReason
      ? {
          state: 'stopped',
          label: 'Stopped',
          tone: 'danger',
          detail: webhook.disabledReason,
        }
      : {
          state: 'off',
          label: 'Switched off',
          tone: 'neutral',
          detail: 'Nothing is sent, and events that happen meanwhile are not kept for later.',
        };
  }
  if (webhook.failingSince) {
    return {
      state: 'failing',
      label: 'Failing',
      tone: 'warning',
      detail: `${failingFor(webhook.failingSince, now)} It is switched off after three days of this.`,
    };
  }
  if (!webhook.lastDelivery) {
    return {
      state: 'waiting',
      label: 'Waiting',
      tone: 'info',
      detail: 'Nothing was sent yet. Send a test to see that the address answers.',
    };
  }
  return {
    state: 'healthy',
    label: 'Healthy',
    tone: 'success',
    detail: `The last delivery got through ${formatRelative(webhook.lastDelivery.at, now)}.`,
  };
}

/** "Nothing got through for 5 hours." */
function failingFor(since: string, now: number): string {
  const relative = formatRelative(since, now);
  return relative.endsWith(' ago')
    ? `Nothing got through for ${relative.slice(0, -4)}.`
    : 'Deliveries started to fail just now.';
}

export function listensToEverything(events: readonly string[]): boolean {
  return events.includes(ALL_EVENTS);
}

/** The label of an event, or its name when this panel does not know it. */
export function eventLabel(name: string, known: readonly WebhookEventInfo[]): string {
  if (name === TEST_EVENT) {
    return 'Test';
  }
  return known.find((event) => event.name === name)?.label ?? name;
}

/** "Everything", "A title was published" or "4 events". */
export function eventSummary(
  events: readonly string[],
  known: readonly WebhookEventInfo[],
): string {
  if (listensToEverything(events)) {
    return 'Everything';
  }
  if (events.length === 1) {
    return eventLabel(events[0] as string, known);
  }
  return `${events.length} events`;
}

export interface EventGroup {
  name: string;
  events: WebhookEventInfo[];
}

/** The events by the part of the installation they belong to, in the order they come. */
export function groupEvents(events: readonly WebhookEventInfo[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const group = groups.find((candidate) => candidate.name === event.group);
    if (group) {
      group.events.push(event);
    } else {
      groups.push({ name: event.group, events: [event] });
    }
  }
  return groups;
}

/** Whether none, some or all events of a group are chosen. */
export function groupState(
  group: EventGroup,
  chosen: ReadonlySet<string>,
): boolean | 'indeterminate' {
  const count = group.events.filter((event) => chosen.has(event.name)).length;
  if (count === 0) {
    return false;
  }
  return count === group.events.length ? true : 'indeterminate';
}

/** Chooses every event of a group, or none of them when all were chosen. */
export function toggleGroup(group: EventGroup, chosen: ReadonlySet<string>): Set<string> {
  const next = new Set(chosen);
  const all = groupState(group, chosen) === true;
  for (const event of group.events) {
    if (all) {
      next.delete(event.name);
    } else {
      next.add(event.name);
    }
  }
  return next;
}

export interface WebhookDraft {
  name: string;
  url: string;
  everything: boolean;
  events: Set<string>;
}

export const EMPTY_DRAFT: WebhookDraft = {
  name: '',
  url: '',
  everything: false,
  events: new Set(),
};

export function draftOf(webhook: Webhook): WebhookDraft {
  const everything = listensToEverything(webhook.events);
  return {
    name: webhook.name,
    url: webhook.url,
    everything,
    events: new Set(everything ? [] : webhook.events),
  };
}

/** What is sent to the API, with the events in the order of the list. */
export function inputOf(draft: WebhookDraft, known: readonly WebhookEventInfo[]): WebhookInput {
  const order = known.map((event) => event.name);
  // Events this panel does not know stay chosen: a newer server may have them.
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  return {
    name: draft.name.trim(),
    url: draft.url.trim(),
    events: draft.everything
      ? [ALL_EVENTS]
      : [...draft.events].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
  };
}

/**
 * What is wrong with an address, in words, before the server is asked. The
 * server checks again and knows more: this only catches slips of the hand.
 */
export function urlProblem(text: string): string | null {
  const value = text.trim();
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a full address that starts with https:// or http://';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'The address has to start with https:// or http://';
  }
  if (url.username || url.password) {
    return 'Leave the user name and password out of the address';
  }
  return null;
}

/** Whether requests to this address travel unencrypted. */
export function isPlainHttp(text: string): boolean {
  return text.trim().toLowerCase().startsWith('http://');
}

export function draftProblem(draft: WebhookDraft): string | null {
  if (!draft.name.trim()) {
    return 'Give the webhook a name';
  }
  if (!draft.url.trim()) {
    return 'Enter the address';
  }
  const problem = urlProblem(draft.url);
  if (problem) {
    return problem;
  }
  if (!draft.everything && draft.events.size === 0) {
    return 'Choose at least one event';
  }
  return null;
}

/** "1 min", "30 min", "2 h", "45 s". */
export function formatDelay(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  const hours = seconds / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/** How long the system keeps trying in all: "about 22 hours". */
export function retryWindow(delays: readonly number[]): string {
  const total = delays.reduce((sum, delay) => sum + delay, 0);
  if (total < 3600) {
    return `about ${Math.max(1, Math.round(total / 60))} minutes`;
  }
  const hours = Math.round(total / 3600);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

export interface DeliveryOutcome {
  label: string;
  tone: BadgeTone;
  /** Shows that something is still going on. */
  live: boolean;
}

/** What became of a delivery, in a word. */
export function deliveryOutcome(delivery: WebhookDelivery): DeliveryOutcome {
  if (delivery.status === 'DELIVERED') {
    return { label: 'Delivered', tone: 'success', live: false };
  }
  if (delivery.status === 'FAILED') {
    return { label: 'Failed', tone: 'danger', live: false };
  }
  return delivery.attempts === 0
    ? { label: 'Queued', tone: 'neutral', live: true }
    : { label: 'Trying again', tone: 'warning', live: true };
}

/** What the address answered, as short as it fits in a table: "200", "503", "No answer". */
export function answerOf(delivery: WebhookDelivery): string {
  if (delivery.responseStatus !== null) {
    return String(delivery.responseStatus);
  }
  return delivery.attempts === 0 ? '—' : 'No answer';
}

/** "Try 2 of 7", and when the next one comes. */
export function triesOf(delivery: WebhookDelivery, now: number = Date.now()): string {
  if (delivery.attempts === 0) {
    return 'Not tried yet';
  }
  const tries = `Try ${delivery.attempts} of ${delivery.maxAttempts}`;
  if (delivery.status !== 'PENDING' || !delivery.nextAttemptAt) {
    return tries;
  }
  const wait = new Date(delivery.nextAttemptAt).getTime() - now;
  return wait <= 0 ? `${tries}, next one now` : `${tries}, next one in ${formatWait(wait)}`;
}

function formatWait(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 90) {
    return `${seconds} s`;
  }
  if (seconds < 5400) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${Math.round(seconds / 3600)} h`;
}

/** The share of finished deliveries that got through, in percent. Null when none finished. */
export function successRate(recent: Webhook['recent']): number | null {
  const finished = recent.delivered + recent.failed;
  return finished === 0 ? null : Math.round((recent.delivered / finished) * 100);
}

export interface ActivitySummary {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  /** The busiest hour, at least 1 so an empty chart still has a scale. */
  peak: number;
}

export function summarizeActivity(hours: readonly WebhookActivityHour[]): ActivitySummary {
  const summary = { total: 0, delivered: 0, failed: 0, pending: 0, peak: 1 };
  for (const hour of hours) {
    const sum = hour.delivered + hour.failed + hour.pending;
    summary.delivered += hour.delivered;
    summary.failed += hour.failed;
    summary.pending += hour.pending;
    summary.total += sum;
    summary.peak = Math.max(summary.peak, sum);
  }
  return summary;
}

export const SAMPLE_LANGUAGES = [
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
] as const;
export type SampleLanguage = (typeof SAMPLE_LANGUAGES)[number]['id'];

/**
 * Code that checks the signature of a request, for the receiver to copy.
 * Each takes the body exactly as it arrived: parsing it and writing it out
 * again changes the bytes, and the signature no longer fits.
 */
export function verificationSample(language: SampleLanguage, toleranceSeconds: number): string {
  if (language === 'python') {
    return `import hashlib
import hmac
import time

def is_from_onyx(raw_body: bytes, headers, secret: str) -> bool:
    timestamp = headers.get("X-Onyx-Timestamp", "")
    signature = headers.get("X-Onyx-Signature", "")
    # Refuse old requests, so a recorded one cannot be sent again later.
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > ${toleranceSeconds}:
        return False
    signed = timestamp.encode() + b"." + raw_body
    expected = "v1=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)`;
  }
  if (language === 'php') {
    return `<?php
function is_from_onyx(string $rawBody, string $secret): bool
{
    $timestamp = $_SERVER['HTTP_X_ONYX_TIMESTAMP'] ?? '';
    $signature = $_SERVER['HTTP_X_ONYX_SIGNATURE'] ?? '';
    // Refuse old requests, so a recorded one cannot be sent again later.
    if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > ${toleranceSeconds}) {
        return false;
    }
    $expected = 'v1=' . hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    return hash_equals($expected, $signature);
}

// $rawBody = file_get_contents('php://input');`;
  }
  return `import { createHmac, timingSafeEqual } from 'node:crypto';

// rawBody: the body exactly as it arrived, before JSON.parse.
export function isFromOnyx(rawBody, headers, secret) {
  const timestamp = headers['x-onyx-timestamp'] ?? '';
  const signature = headers['x-onyx-signature'] ?? '';
  // Refuse old requests, so a recorded one cannot be sent again later.
  if (!/^\\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > ${toleranceSeconds}) {
    return false;
  }
  const expected =
    'v1=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}`;
}

/** The headers of a request, with what each is for. */
export const REQUEST_HEADERS: readonly (readonly [name: string, meaning: string])[] = [
  ['X-Onyx-Event', 'The name of the event, such as title.published.'],
  ['X-Onyx-Delivery', 'The id of the delivery. The same on every retry: use it to skip repeats.'],
  ['X-Onyx-Timestamp', 'When this request was sent, in seconds since 1970.'],
  ['X-Onyx-Signature', 'v1= and the HMAC-SHA256 of "timestamp.body" with the signing secret.'],
];
