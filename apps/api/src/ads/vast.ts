// SPDX-License-Identifier: AGPL-3.0-only
import { isWebAddress } from './ad-rules.js';
import { child, childrenNamed, parseXml, type XmlNode } from './xml.js';

/** The events of a creative that an ad server wants to hear about. */
export const TRACKED = [
  'start',
  'firstQuartile',
  'midpoint',
  'thirdQuartile',
  'complete',
  'skip',
] as const;
export type TrackedEvent = (typeof TRACKED)[number];

/** What a player needs to play one ad and to tell everyone who must know. */
export interface ResolvedAd {
  mediaUrl: string;
  /** "application/x-mpegURL" for HLS, otherwise the type of the file. */
  mimeType: string;
  durationMs: number | null;
  /** After how many milliseconds the ad may be skipped. Null: it cannot be. */
  skipOffsetMs: number | null;
  clickThrough: string | null;
  clickTracking: string[];
  impressions: string[];
  /** Addresses to call when the ad fails. They hold [ERRORCODE] where the code goes. */
  errors: string[];
  tracking: Record<TrackedEvent, string[]>;
}

interface Extras {
  impressions: string[];
  errors: string[];
  clickTracking: string[];
  tracking: Record<TrackedEvent, string[]>;
}

export type ParsedVast =
  | { kind: 'inline'; ad: ResolvedAd }
  | { kind: 'wrapper'; tagUri: string; extras: Extras }
  | { kind: 'empty'; errors: string[] };

export function emptyExtras(): Extras {
  return {
    impressions: [],
    errors: [],
    clickTracking: [],
    tracking: {
      start: [],
      firstQuartile: [],
      midpoint: [],
      thirdQuartile: [],
      complete: [],
      skip: [],
    },
  };
}

const urls = (nodes: XmlNode[]): string[] =>
  nodes.map((node) => node.text).filter((value) => isWebAddress(value));

/** "00:00:05", "00:00:05.500" or "5" as milliseconds. Null for anything else. */
export function parseClock(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, hours, minutes, seconds, fraction] = match;
  const millis = Number((fraction ?? '').padEnd(3, '0') || 0);
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + millis;
}

/** The skip offset of a Linear element: a time, or a share of the duration. */
export function skipOffsetOf(value: string | undefined, durationMs: number | null): number | null {
  if (!value) {
    return null;
  }
  if (value.trim().endsWith('%')) {
    const share = Number.parseFloat(value);
    return durationMs !== null && Number.isFinite(share) && share >= 0 && share <= 100
      ? Math.round((durationMs * share) / 100)
      : null;
  }
  return parseClock(value);
}

interface MediaChoice {
  url: string;
  type: string;
  width: number;
  bitrate: number;
}

const HLS = /^application\/(x-mpegurl|vnd\.apple\.mpegurl)$/i;
const PLAYABLE = /^video\/(mp4|webm)$/i;

/**
 * Picks the file to play: a playlist when there is one, otherwise the largest
 * picture up to 1280 pixels wide, so that an ad does not load more than the
 * video it sits in front of. Files that need a script (VPAID) are never chosen.
 */
export function chooseMedia(files: XmlNode[]): { url: string; type: string } | null {
  const candidates: MediaChoice[] = [];
  for (const file of files) {
    const url = file.text;
    const type = (file.attributes.type ?? '').trim();
    if (!isWebAddress(url) || file.attributes.apiFramework) {
      continue;
    }
    if (file.attributes.delivery === 'streaming' && !HLS.test(type)) {
      continue;
    }
    if (HLS.test(type) || PLAYABLE.test(type)) {
      candidates.push({
        url,
        type: HLS.test(type) ? 'application/x-mpegURL' : type.toLowerCase(),
        width: Number(file.attributes.width) || 0,
        bitrate: Number(file.attributes.bitrate) || 0,
      });
    }
  }
  const hls = candidates.find((candidate) => candidate.type === 'application/x-mpegURL');
  if (hls) {
    return { url: hls.url, type: hls.type };
  }
  const fitting = candidates.filter((candidate) => candidate.width <= 1280);
  const pool = fitting.length > 0 ? fitting : candidates;
  const best = pool.toSorted((a, b) => b.width - a.width || b.bitrate - a.bitrate)[0];
  return best ? { url: best.url, type: best.type } : null;
}

function readExtras(adBody: XmlNode): Extras {
  const extras = emptyExtras();
  extras.impressions = urls(childrenNamed(adBody, 'Impression'));
  extras.errors = urls(childrenNamed(adBody, 'Error'));
  for (const creative of childrenNamed(child(adBody, 'Creatives'), 'Creative')) {
    const linear = child(creative, 'Linear');
    if (!linear) {
      continue;
    }
    for (const tracking of childrenNamed(child(linear, 'TrackingEvents'), 'Tracking')) {
      const event = tracking.attributes.event as TrackedEvent | undefined;
      if (event && (TRACKED as readonly string[]).includes(event) && isWebAddress(tracking.text)) {
        extras.tracking[event].push(tracking.text);
      }
    }
    extras.clickTracking.push(
      ...urls(childrenNamed(child(linear, 'VideoClicks'), 'ClickTracking')),
    );
  }
  return extras;
}

/** Reads a VAST document: the ad it holds, or where to look for it next. */
export function parseVast(source: string): ParsedVast {
  const root = parseXml(source);
  if (!root || root.name !== 'VAST') {
    return { kind: 'empty', errors: [] };
  }
  // A document may hold several ads, as a pod. One is played: the first in order.
  const ads = childrenNamed(root, 'Ad').toSorted(
    (a, b) => (Number(a.attributes.sequence) || 0) - (Number(b.attributes.sequence) || 0),
  );
  const ad = ads[0];
  if (!ad) {
    return { kind: 'empty', errors: urls(childrenNamed(root, 'Error')) };
  }
  const wrapper = child(ad, 'Wrapper');
  if (wrapper) {
    const tagUri = child(wrapper, 'VASTAdTagURI')?.text ?? '';
    return isWebAddress(tagUri)
      ? { kind: 'wrapper', tagUri, extras: readExtras(wrapper) }
      : { kind: 'empty', errors: readExtras(wrapper).errors };
  }
  const inline = child(ad, 'InLine');
  if (!inline) {
    return { kind: 'empty', errors: [] };
  }
  const extras = readExtras(inline);
  for (const creative of childrenNamed(child(inline, 'Creatives'), 'Creative')) {
    const linear = child(creative, 'Linear');
    if (!linear) {
      continue;
    }
    const media = chooseMedia(childrenNamed(child(linear, 'MediaFiles'), 'MediaFile'));
    if (!media) {
      continue;
    }
    const durationMs = parseClock(child(linear, 'Duration')?.text);
    const click = child(child(linear, 'VideoClicks'), 'ClickThrough')?.text ?? '';
    return {
      kind: 'inline',
      ad: {
        mediaUrl: media.url,
        mimeType: media.type,
        durationMs,
        skipOffsetMs: skipOffsetOf(linear.attributes.skipoffset, durationMs),
        clickThrough: isWebAddress(click) ? click : null,
        clickTracking: extras.clickTracking,
        impressions: extras.impressions,
        errors: extras.errors,
        tracking: extras.tracking,
      },
    };
  }
  return { kind: 'empty', errors: extras.errors };
}

/** Adds what a wrapper asks to be told to what the ad it leads to asks. */
export function mergeExtras(outer: Extras, ad: ResolvedAd): ResolvedAd {
  const tracking = { ...ad.tracking };
  for (const event of TRACKED) {
    tracking[event] = [...outer.tracking[event], ...ad.tracking[event]];
  }
  return {
    ...ad,
    impressions: [...outer.impressions, ...ad.impressions],
    errors: [...outer.errors, ...ad.errors],
    clickTracking: [...outer.clickTracking, ...ad.clickTracking],
    tracking,
  };
}
