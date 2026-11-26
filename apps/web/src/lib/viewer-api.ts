// SPDX-License-Identifier: AGPL-3.0-only
//
// Calls the browser makes about the viewer's own account. They go to the same
// origin, so the session cookie travels with them by itself.
import type { Opens, OwnedTitle, OwnPayment, OwnSubscription } from './plans';
import type { Profile } from './profiles';

export interface Viewer {
  id: string;
  email: string;
  displayName: string;
  /** Whether the viewer showed that the address is theirs. */
  emailVerified: boolean;
  createdAt: string;
}

/** A device the viewer is signed in on. */
/** A viewer with the profile in use. The type of a profile lives in lib/profiles. */
export interface SignedIn {
  viewer: Viewer;
  profile: Profile;
  /**
   * Whether a profile has to be chosen before anything else: the main one
   * has a PIN. Left out by an API older than parental controls.
   */
  chooseProfile?: boolean;
  /** Whether the viewer has a running subscription. */
  entitled?: boolean;
  /** Which paid titles it opens. Left out by an API older than packages. */
  access?: Opens;
  /** Titles rented or bought. Left out by an API older than renting. */
  purchases?: OwnedTitle[];
}

/** A rented or bought title in the viewer's own list. */
export interface OwnPurchase extends OwnedTitle {
  id: string;
  title: { slug: string; name: string; type: string; poster: { url: string } | null };
  purchasedAt: string;
  /** Whether it can be watched right now. */
  valid: boolean;
}

export interface ViewerDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
  /** The app the sign-in belongs to. Null for a browser, and from an API older than devices. */
  device?: { id: string; name: string; kind: string; platform: string } | null;
}

/** What is open on this site. */
export interface AccessConfig {
  registration: 'open' | 'closed';
  playback: 'open' | 'viewers' | 'off';
  /** Whether the site sends email, so "forgot password" and confirming an address work. */
  email: boolean;
  /** Whether watching needs a confirmed address. */
  verification: 'optional' | 'required';
}

/** A request the API refused, with a message that can be shown to the viewer. */
export class ViewerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Messages per form field, for a request that failed validation. */
    readonly fields: Readonly<Record<string, string>> = {},
    /** What the API calls the refusal, such as "pin_wrong", for code that reacts to it. */
    readonly code: string | null = null,
    /** After a wrong PIN: how many more tries the profile takes. */
    readonly attemptsLeft: number | null = null,
  ) {
    super(message);
    this.name = 'ViewerApiError';
  }
}

interface ErrorBody {
  message?: string | string[];
  issues?: { field: string; message: string }[];
  retryAfterSeconds?: number;
  code?: string;
  attemptsLeft?: number;
}

function minutesOf(seconds: number | undefined): number | null {
  return seconds ? Math.ceil(seconds / 60) : null;
}

/** Turns a refused response into words for the person in front of the screen. */
export function toViewerApiError(status: number, body: ErrorBody | null): ViewerApiError {
  if (status === 429 && body?.code === 'mail_recently_sent') {
    return new ViewerApiError(
      status,
      'An email was sent a moment ago. Check your inbox, and the spam folder. You can ask again in two minutes.',
    );
  }
  if (body?.code === 'pin_locked') {
    const minutes = minutesOf(body.retryAfterSeconds);
    return new ViewerApiError(
      status,
      minutes
        ? `Too many wrong PINs. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
        : 'Too many wrong PINs. Try again in a few minutes.',
      {},
      body.code,
    );
  }
  if (body?.code === 'pin_wrong') {
    const left = body.attemptsLeft ?? null;
    return new ViewerApiError(
      status,
      left === null
        ? 'That PIN is not right.'
        : left === 0
          ? 'That PIN is not right. This profile takes no more tries for five minutes.'
          : `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
      {},
      body.code,
      left,
    );
  }
  if (status === 429) {
    const minutes = minutesOf(body?.retryAfterSeconds);
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
  return new ViewerApiError(
    status,
    message || 'Something went wrong. Try again in a moment.',
    {},
    body?.code ?? null,
  );
}

/**
 * Calls the API of the viewer's own account.
 *
 * @param keepalive Lets the request finish after the page is left.
 */
export async function call<Result>(
  method: string,
  path: string,
  body?: unknown,
  keepalive = false,
): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(`/v1/viewer${path}`, {
      method,
      credentials: 'same-origin',
      keepalive,
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
  /** Who is signed in and which profile is in use on this device. Both null for a visitor. */
  session: () =>
    call<
      | SignedIn
      | {
          viewer: null;
          profile: null;
          chooseProfile?: boolean;
          entitled?: boolean;
          access?: Opens;
          purchases?: OwnedTitle[];
        }
    >('GET', '/session'),
  /** The viewer's own subscription, or null. */
  subscription: () =>
    call<{
      subscription: OwnSubscription | null;
      entitled: boolean;
      access?: Opens;
      trialUsed?: boolean;
      purchases?: OwnedTitle[];
    }>('GET', '/subscription'),
  /** The viewer's own payments, newest first. */
  payments: () => call<{ items: OwnPayment[] }>('GET', '/payments'),
  /** Opens the payment page for a plan. Answers with the address to go to. */
  /** @param code A coupon code that was checked for this plan. */
  checkout: (planId: string, interval: 'MONTH' | 'YEAR', code?: string) =>
    call<{ url: string }>('POST', '/checkout', { planId, interval, code }),
  /** Tells the site that the viewer is back from paying. */
  confirmCheckout: (sessionId: string) =>
    call<{
      subscription: OwnSubscription | null;
      entitled: boolean;
      access?: Opens;
      purchases?: OwnedTitle[];
    }>('POST', '/checkout/confirm', {
      sessionId,
    }),
  /** Opens the payment page for renting or buying a title. Answers with the address to go to. */
  purchase: (titleId: string, kind: 'RENT' | 'BUY', code?: string) =>
    call<{ url: string }>('POST', '/purchases/checkout', { titleId, kind, code }),
  /** The viewer's rented and bought titles, newest first. */
  purchases: () => call<{ items: OwnPurchase[] }>('GET', '/purchases'),
  /** Opens the page for changing the card, reading invoices and cancelling. */
  billingPortal: () => call<{ url: string }>('POST', '/billing-portal'),
  register: (input: { email: string; displayName: string; password: string }) =>
    call<SignedIn>('POST', '/register', input),
  login: (input: { email: string; password: string }) => call<SignedIn>('POST', '/login', input),
  logout: () => call<void>('POST', '/logout'),
  rename: (displayName: string) => call<Viewer>('PATCH', '/me', { displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<void>('POST', '/password', { currentPassword, newPassword }),
  devices: () => call<ViewerDevice[]>('GET', '/sessions'),
  signOutDevice: (id: string) => call<void>('DELETE', `/sessions/${id}`),
  deleteAccount: (password: string) => call<void>('POST', '/delete', { password }),
  /** Asks for a link to set a new password. Succeeds whether or not the address is known. */
  forgotPassword: (email: string) => call<void>('POST', '/password/forgot', { email }),
  resetPassword: (token: string, newPassword: string) =>
    call<void>('POST', '/password/reset', { token, newPassword }),
  verifyEmail: (token: string) => call<{ email: string }>('POST', '/email/verify', { token }),
  /**
   * Asks to use another address. With email set up a link goes to the new address and
   * nothing changes until it is opened ("confirmation_sent"); without, it changes at once.
   */
  changeEmail: (newEmail: string, password: string) =>
    call<{ status: 'confirmation_sent' | 'changed'; email: string }>('POST', '/email/change', {
      newEmail,
      password,
    }),
  /** Uses the new address with the token of the link sent to it. */
  confirmEmailChange: (token: string) =>
    call<{ email: string }>('POST', '/email/change/confirm', { token }),
  /** Sends the link to confirm the address again. */
  sendVerification: () => call<void>('POST', '/email/send'),
};

/**
 * The token of a link from an email. It rides in the fragment of the address
 * ("#token=…"), which the browser sends to no server.
 */
export function readLinkToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : null;
}

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
