// SPDX-License-Identifier: AGPL-3.0-only
//
// Calls the browser makes about the viewer's own account. They go to the same
// origin, so the session cookie travels with them by itself.

export interface Viewer {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

/** A device the viewer is signed in on. */
export interface ViewerDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

/** What is open on this site. */
export interface AccessConfig {
  registration: 'open' | 'closed';
  playback: 'open' | 'viewers' | 'off';
}

/** A request the API refused, with a message that can be shown to the viewer. */
export class ViewerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Messages per form field, for a request that failed validation. */
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ViewerApiError';
  }
}

interface ErrorBody {
  message?: string | string[];
  issues?: { field: string; message: string }[];
  retryAfterSeconds?: number;
}

/** Turns a refused response into words for the person in front of the screen. */
export function toViewerApiError(status: number, body: ErrorBody | null): ViewerApiError {
  if (status === 429) {
    const minutes = body?.retryAfterSeconds ? Math.ceil(body.retryAfterSeconds / 60) : null;
    return new ViewerApiError(
      status,
      minutes
        ? `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
        : 'Too many attempts. Try again in a little while.',
    );
  }
  if (body?.issues && body.issues.length > 0) {
    const fields: Record<string, string> = {};
    for (const issue of body.issues) {
      fields[issue.field] ??= issue.message;
    }
    return new ViewerApiError(status, body.issues[0]?.message ?? 'Check what you entered.', fields);
  }
  const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
  return new ViewerApiError(status, message || 'Something went wrong. Try again in a moment.');
}

async function call<Result>(method: string, path: string, body?: unknown): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(`/v1/viewer${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ViewerApiError(0, 'The site could not be reached. Check your connection.');
  }
  if (!response.ok) {
    throw toViewerApiError(response.status, (await response.json().catch(() => null)) as ErrorBody);
  }
  return (response.status === 204 ? undefined : await response.json()) as Result;
}

export const viewerApi = {
  config: () => call<AccessConfig>('GET', '/config'),
  /** The signed-in viewer, or null when nobody is signed in. */
  me: () => call<{ viewer: Viewer | null }>('GET', '/session').then((result) => result.viewer),
  register: (input: { email: string; displayName: string; password: string }) =>
    call<{ viewer: Viewer }>('POST', '/register', input).then((result) => result.viewer),
  login: (input: { email: string; password: string }) =>
    call<{ viewer: Viewer }>('POST', '/login', input).then((result) => result.viewer),
  logout: () => call<void>('POST', '/logout'),
  rename: (displayName: string) => call<Viewer>('PATCH', '/me', { displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<void>('POST', '/password', { currentPassword, newPassword }),
  devices: () => call<ViewerDevice[]>('GET', '/sessions'),
  signOutDevice: (id: string) => call<void>('DELETE', `/sessions/${id}`),
  deleteAccount: (password: string) => call<void>('POST', '/delete', { password }),
};

/**
 * Where to go after signing in. Only a path on this site is accepted, so a
 * link someone was sent cannot use the sign-in page to lead elsewhere.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/';
  }
  // Coming back to a sign-in page after signing in would be a loop.
  return /^\/(sign-in|sign-up)(\/|\?|$)/.test(next) ? '/' : next;
}

/** A sign-in or sign-up address that leads back to where the viewer was. */
export function authHref(page: 'sign-in' | 'sign-up', next: string | null | undefined): string {
  const target = safeNextPath(next);
  return target === '/' ? `/${page}` : `/${page}?next=${encodeURIComponent(target)}`;
}

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/Chrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b.*\bTV\b|\bSmart-?TV\b|\bTizen\b|\bwebOS\b/i, 'TV'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bCrOS\b/, 'Chromebook'],
  [/\bLinux\b/, 'Linux'],
];

/** A short name for a device, such as "Chrome on Windows", from what it says about itself. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  return browser ?? system ?? (userAgent.split(/[/\s(]/)[0]?.slice(0, 40) || 'Unknown device');
}

/** "today", "yesterday", "5 days ago", then the date. */
export function formatDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return date.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
}
