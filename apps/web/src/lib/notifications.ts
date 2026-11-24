// SPDX-License-Identifier: AGPL-3.0-only
//
// Notifications of the account: the list of what was sent, the kinds the
// viewer wants, and this browser as a device that takes them.
import { call } from './viewer-api';

export type Topic = 'NEW_EPISODES' | 'NEW_TITLES' | 'ANNOUNCEMENTS';

export const TOPIC_LOOKS: Record<Topic, { label: string; about: string }> = {
  NEW_EPISODES: {
    label: 'New episodes',
    about: 'When a series on your list, or one you are watching, has a new episode.',
  },
  NEW_TITLES: { label: 'New titles', about: 'When new movies and series arrive.' },
  ANNOUNCEMENTS: {
    label: 'News from us',
    about: 'Offers, premieres and what else we have to say.',
  },
};
export const TOPICS = Object.keys(TOPIC_LOOKS) as Topic[];

export interface NotificationItem {
  id: string;
  topic: Topic;
  title: string;
  body: string;
  image: string | null;
  /** A path on this website, or null. */
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
  next: string | null;
}

export interface NotificationSettings {
  topics: Record<Topic, boolean>;
  /** Devices of the account that take notifications, and whether this one does. */
  devices: number;
  thisDevice: boolean;
}

export const notificationsApi = {
  list: (before?: string) =>
    call<NotificationList>('GET', `/notifications${before ? `?before=${before}` : ''}`),
  unread: () => call<{ unread: number }>('GET', '/notifications/unread').then((r) => r.unread),
  read: (ids?: string[]) =>
    call<{ read: number }>('POST', '/notifications/read', ids ? { ids } : {}),
  opened: (id: string) => call<void>('POST', `/notifications/${id}/opened`),
  remove: (id: string) => call<void>('DELETE', `/notifications/${id}`),
  settings: () => call<NotificationSettings>('GET', '/notifications/settings'),
  setTopics: (topics: Partial<Record<Topic, boolean>>) =>
    call<NotificationSettings>('PATCH', '/notifications/settings', { topics }),
  register: (subscription: PushSubscriptionJSON, language?: string) =>
    call<{ id: string }>('PUT', '/push/devices', {
      provider: 'WEB',
      subscription,
      platform: 'web',
      language,
    }),
  forget: (endpoint: string) =>
    call<void>('POST', '/push/devices/forget', { provider: 'WEB', token: endpoint }),
};

/** Only paths of this website are followed: anything else an API might send leads home. */
export function safeLink(link: string | null | undefined): string | null {
  return link && /^\/(?!\/)/.test(link) ? link : null;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the day. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return then.toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

/** The mark on the bell: the number, and "9+" from ten on. Null: no mark. */
export function badgeOf(unread: number): string | null {
  return unread > 9 ? '9+' : unread > 0 ? String(unread) : null;
}

/** The key of the server as browsers want it: bytes, not text. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/**
 * What this browser can do about notifications. "unsupported": it cannot
 * take them at all (on an iPhone, only a website put on the home screen
 * can). "blocked": the viewer said no, and only the browser's own settings
 * undo that.
 */
export type PushSupport = 'unsupported' | 'blocked' | 'ask' | 'allowed';

export function pushSupport(): PushSupport {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return Notification.permission === 'denied'
    ? 'blocked'
    : Notification.permission === 'granted'
      ? 'allowed'
      : 'ask';
}

const WORKER = '/push-sw.js';

async function serverKey(): Promise<string> {
  const response = await fetch('/v1/push/config', { credentials: 'omit' });
  if (!response.ok) {
    throw new Error('Notifications are not available right now.');
  }
  return ((await response.json()) as { web: { publicKey: string } }).web.publicKey;
}

/** The subscription of this browser, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() === 'unsupported') {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Makes this browser take notifications for the account: asks the viewer,
 * subscribes at the push service of the browser, and tells the server.
 *
 * @returns False when the viewer said no.
 * @throws Error with words for the viewer when it could not be done.
 */
export async function enablePush(language?: string): Promise<boolean> {
  if (pushSupport() === 'unsupported') {
    throw new Error('This browser cannot take notifications.');
  }
  if ((await Notification.requestPermission()) !== 'granted') {
    return false;
  }
  const key = await serverKey();
  const registration = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made for another key takes nothing from this server.
  const made = subscription?.options.applicationServerKey;
  if (subscription && made && !sameBytes(new Uint8Array(made), keyBytes(key))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
  await notificationsApi.register(subscription.toJSON(), language);
  return true;
}

/** Stops notifications in this browser. The other devices of the account go on. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) {
    await notificationsApi.forget(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
}

/**
 * Says again that this browser takes notifications, for the sign-in of now.
 * A browser that was subscribed under another sign-in is thereby moved to
 * this one. Does nothing, and asks nothing, when the viewer never allowed them.
 */
export async function refreshPush(language?: string): Promise<void> {
  if (pushSupport() !== 'allowed') {
    return;
  }
  const subscription = await currentSubscription();
  if (subscription) {
    await notificationsApi.register(subscription.toJSON(), language);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
