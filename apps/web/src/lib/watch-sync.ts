// SPDX-License-Identifier: AGPL-3.0-only
//
// Keeps the list in the browser and the list of the account the same. Pages
// read and write the list in the browser, which is there at once. For a
// signed-in viewer every change also goes to the account, and the account's
// list is fetched when a page opens, so another device shows the same.
import {
  findEntry,
  isResumable,
  markSynced,
  mergeUnsynced,
  readEntries,
  removeEntry,
  replaceEntries,
  saveEntry,
  targetOf,
  toReport,
  type WatchEntry,
  type WatchReport,
} from './progress';
import { watchingApi } from './watching-api';

/** The API takes this many positions in one request. */
const MAX_REPORTS = 50;
/**
 * The browser notes the position every few seconds. The account hears of it
 * this often, and at once when the viewer pauses for good by leaving.
 */
const REPORT_EVERY_MS = 15_000;

let lastReport = { key: '', at: 0 };

let signedIn = false;
let running: Promise<void> = Promise.resolve();

async function sync(): Promise<void> {
  const startedAt = Date.now();
  const reports = readEntries()
    .filter((entry) => !entry.synced)
    .map(toReport)
    .filter((report): report is WatchReport => report !== null)
    .slice(0, MAX_REPORTS);

  let delivered = true;
  if (reports.length > 0) {
    try {
      await watchingApi.report(reports);
    } catch {
      // Offline, or refused. The entries stay here and are offered again.
      delivered = false;
    }
  }

  const account = await watchingApi.list();
  if (!signedIn) {
    return;
  }
  // What was delivered is in the account's list now. What the player wrote
  // while this ran is newer than that list and is kept.
  const local = readEntries().filter((entry) => !delivered || entry.updatedAt > startedAt);
  replaceEntries(mergeUnsynced(account, local));
}

/**
 * Called when it is known who is signed in. For a viewer it hands over what
 * this device kept and takes the list of the account. For a visitor it drops
 * what belonged to an account that is no longer signed in here.
 */
export function startSync(viewerSignedIn: boolean): void {
  signedIn = viewerSignedIn;
  if (!viewerSignedIn) {
    const entries = readEntries();
    if (entries.some((entry) => entry.synced)) {
      replaceEntries(entries.filter((entry) => !entry.synced));
    }
    running = Promise.resolve();
    return;
  }
  running = sync().catch(() => {
    // The list in the browser stays as it was.
  });
}

/**
 * Called when another profile is chosen on this device: the list in the
 * browser was that of the profile before, and is replaced by the new one's.
 */
export function restartSync(): void {
  replaceEntries([]);
  startSync(true);
}

/** Called on sign-out: what the account watched does not stay on the device. */
export function endSync(): void {
  signedIn = false;
  running = Promise.resolve();
  replaceEntries([]);
}

/**
 * Resolves when the list in the browser is up to date with the account, or
 * after a short wait. A player asks before it decides where to start.
 */
export function syncSettled(timeoutMs = 2500): Promise<void> {
  return Promise.race([
    running,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}

/**
 * Remembers where the viewer is in a video.
 *
 * @param leaving The viewer is leaving the video: the account is told now,
 *   with a request the browser finishes even when the page is gone.
 */
export function recordPosition(entry: WatchEntry, leaving = false): void {
  const known = findEntry(entry.key) !== undefined;
  saveEntry({ ...entry, synced: false });
  // The first seconds of a video nobody has begun are nothing to tell.
  if (!signedIn || (!known && !isResumable(entry.position, entry.duration, entry.creditsAt))) {
    return;
  }
  const now = Date.now();
  if (!leaving && lastReport.key === entry.key && now - lastReport.at < REPORT_EVERY_MS) {
    return;
  }
  const target = targetOf(entry);
  if (!target) {
    return;
  }
  lastReport = { key: entry.key, at: now };
  watchingApi
    .report([{ ...target, position: entry.position, duration: entry.duration }], leaving)
    .then(() => markSynced(entry.key, entry.updatedAt))
    .catch(() => {
      // Stays unsynced and is handed over when the next page opens.
    });
}

/** Notes that a video was watched to its end. */
export function recordFinished(entry: Pick<WatchEntry, 'key' | 'href'>, duration: number): void {
  removeEntry(entry.key);
  const target = targetOf(entry);
  if (!signedIn || !target || !(duration > 0)) {
    return;
  }
  watchingApi.report([{ ...target, position: duration, duration }]).catch(() => {
    // The account keeps the last position, which is close to the end.
  });
}

/** Takes a video out of "Continue watching". */
export function forgetEntry(entry: Pick<WatchEntry, 'key' | 'id'>): void {
  removeEntry(entry.key);
  if (signedIn && entry.id) {
    watchingApi.remove(entry.id).catch(() => {
      // Not there any more, or offline. The next sync shows what the account holds.
    });
  }
}

/** Forgets everything the account watched, here and in the account. */
export async function clearHistory(): Promise<void> {
  await watchingApi.clear();
  replaceEntries([]);
}
