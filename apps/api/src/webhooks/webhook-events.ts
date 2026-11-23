// SPDX-License-Identifier: AGPL-3.0-only

/** What a webhook can be told about, with what it is sent as an example. */
export interface WebhookEventInfo {
  name: string;
  /** The part of the installation it belongs to, for grouping in the panel. */
  group: 'Catalog' | 'Media' | 'Viewers' | 'Billing' | 'System';
  label: string;
  description: string;
  /** An example of `data`, as documentation that cannot go out of date unnoticed. */
  sample: Record<string, unknown>;
}

const TITLE = {
  id: '0193a5d2-7c1e-7b3a-9f4e-2b6c8d1e5a70',
  type: 'MOVIE',
  name: 'Harbour Lights',
  slug: 'harbour-lights',
  status: 'PUBLISHED',
};
const VIEWER = { id: '0193a5d2-8a40-7c11-b2d3-4e5f6a7b8c9d', email: 'lena@example.com' };

export const WEBHOOK_EVENT_LIST = [
  {
    name: 'title.published',
    group: 'Catalog',
    label: 'A title was published',
    description: 'A movie or series became visible to viewers.',
    sample: { title: TITLE },
  },
  {
    name: 'title.unpublished',
    group: 'Catalog',
    label: 'A title was taken off the site',
    description: 'A published movie or series went back to draft or was archived.',
    sample: { title: { ...TITLE, status: 'DRAFT' } },
  },
  {
    name: 'title.updated',
    group: 'Catalog',
    label: 'A title was changed',
    description:
      'Anything its history follows changed: texts, artwork, people, videos, episodes. Says which parts.',
    sample: { title: TITLE, action: 'update', changed: ['Synopsis', 'Genres'] },
  },
  {
    name: 'title.deleted',
    group: 'Catalog',
    label: 'A title was deleted',
    description: 'A movie or series was removed for good.',
    sample: { title: { id: TITLE.id, type: TITLE.type, name: TITLE.name, slug: TITLE.slug } },
  },
  {
    name: 'asset.ready',
    group: 'Media',
    label: 'A video is ready to play',
    description: 'Processing of an uploaded video finished.',
    sample: {
      asset: {
        id: '0193a5d2-9b52-7d22-a3e4-5f6a7b8c9d0e',
        title: 'Harbour Lights',
        status: 'READY',
      },
    },
  },
  {
    name: 'asset.failed',
    group: 'Media',
    label: 'A video could not be processed',
    description: 'Processing of an uploaded video failed for good.',
    sample: {
      asset: {
        id: '0193a5d2-9b52-7d22-a3e4-5f6a7b8c9d0e',
        title: 'Harbour Lights',
        status: 'FAILED',
      },
    },
  },
  {
    name: 'viewer.created',
    group: 'Viewers',
    label: 'A viewer signed up',
    description: 'A viewer account was made, by signing up or by an admin.',
    sample: { viewer: { ...VIEWER, displayName: 'Lena' }, by: 'signup' },
  },
  {
    name: 'subscription.started',
    group: 'Billing',
    label: 'A subscription started',
    description: 'A viewer got a subscription, paid online or granted by an admin.',
    sample: {
      subscription: {
        id: '0193a5d2-ac63-7e33-b4f5-6a7b8c9d0e1f',
        status: 'ACTIVE',
        source: 'STRIPE',
        plan: { id: '0193a5d2-bd74-7f44-8506-7b8c9d0e1f2a', name: 'Standard' },
      },
      viewer: VIEWER,
    },
  },
  {
    name: 'subscription.ended',
    group: 'Billing',
    label: 'A subscription ended',
    description: 'A subscription was canceled with immediate effect or ran out.',
    sample: {
      subscription: {
        id: '0193a5d2-ac63-7e33-b4f5-6a7b8c9d0e1f',
        status: 'CANCELED',
        source: 'STRIPE',
        plan: { id: '0193a5d2-bd74-7f44-8506-7b8c9d0e1f2a', name: 'Standard' },
      },
      viewer: VIEWER,
    },
  },
  {
    name: 'purchase.completed',
    group: 'Billing',
    label: 'A title was rented or bought',
    description: 'A viewer rented or bought a single title, or was given one by an admin.',
    sample: {
      purchase: { id: '0193a5d2-ce85-7055-9617-8c9d0e1f2a3b', kind: 'RENT', source: 'STRIPE' },
      title: { id: TITLE.id, name: TITLE.name },
      viewer: VIEWER,
    },
  },
  {
    name: 'payment.received',
    group: 'Billing',
    label: 'A payment was received',
    description:
      'Money came in: a subscription invoice, a rental, a purchase, or a payment recorded by hand.',
    sample: {
      payment: {
        id: '0193a5d2-df96-7166-a728-9d0e1f2a3b4c',
        amount: 799,
        currency: 'EUR',
        source: 'STRIPE',
        kind: 'SUBSCRIPTION',
      },
      viewer: VIEWER,
    },
  },
  {
    name: 'backup.completed',
    group: 'System',
    label: 'A backup was made',
    description: 'A backup of the database finished.',
    sample: {
      backup: { id: '0193a5d2-e0a7-7277-b839-0e1f2a3b4c5d', bytes: 4821331, scheduled: true },
    },
  },
  {
    name: 'backup.failed',
    group: 'System',
    label: 'A backup failed',
    description: 'A backup of the database could not be made.',
    sample: {
      backup: {
        id: '0193a5d2-e0a7-7277-b839-0e1f2a3b4c5d',
        scheduled: true,
        error: 'pg_dump is not installed',
      },
    },
  },
] as const satisfies readonly WebhookEventInfo[];

export type WebhookEventName = (typeof WEBHOOK_EVENT_LIST)[number]['name'];

/** Sent by "Send a test", to any webhook whatever it listens to. */
export const TEST_EVENT = 'webhook.test';
/** In the list of events of a webhook: every event, also those added later. */
export const ALL_EVENTS = '*';

export const WEBHOOK_EVENT_NAMES: readonly string[] = WEBHOOK_EVENT_LIST.map((event) => event.name);

export function isWebhookEvent(value: string): value is WebhookEventName {
  return WEBHOOK_EVENT_NAMES.includes(value);
}

/** Whether a webhook with this list of events is told about an event. */
export function listensTo(events: readonly string[], event: string): boolean {
  return events.includes(ALL_EVENTS) || events.includes(event);
}

/** The body of a request: the same envelope around every event. */
export interface WebhookEnvelope {
  /** The id of this delivery. A retry carries the same one, so a receiver can tell repeats. */
  id: string;
  event: string;
  /** When it happened, as an ISO moment. */
  createdAt: string;
  data: unknown;
}
