// SPDX-License-Identifier: AGPL-3.0-only
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { isForbiddenAddress, isPrivateAddress } from '../common/outbound-address.js';
import { emptyExtras, mergeExtras, parseVast, type ResolvedAd } from './vast.js';

/** How many tags are followed: the one in the panel, and the wrappers behind it. */
const MAX_HOPS = 5;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;

/** Who asks, as far as the ad server should know. */
export interface AdClient {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Fetches the text at an address. Replaced by a test. */
export type TagFetcher = (url: string, client: AdClient, signal: AbortSignal) => Promise<string>;

/** Replaces the macros that any ad server tag may hold. */
export function fillMacros(url: string, now: Date = new Date()): string {
  const random = String(Math.floor(Math.random() * 1e10));
  return url
    .replaceAll(/\[(?:CACHEBUSTING|RANDOM)\]|%5B(?:CACHEBUSTING|RANDOM)%5D/gi, random)
    .replaceAll(/\[TIMESTAMP\]|%5BTIMESTAMP%5D/gi, now.toISOString());
}

/**
 * Whether the address may be called. The tag typed in the panel may point
 * into a private network, such as an ad server of the operator's own. A tag
 * an ad server names in a wrapper never may: nobody typed it.
 */
async function assertCallable(url: URL, allowPrivate: boolean): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Not a web address');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address);
  for (const address of addresses) {
    if (isForbiddenAddress(address) || (!allowPrivate && isPrivateAddress(address))) {
      throw new Error('This address is not called');
    }
  }
}

const fetchTag =
  (allowPrivate: boolean): TagFetcher =>
  async (start, client, signal) => {
    let target = start;
    for (let hop = 0; ; hop += 1) {
      await assertCallable(new URL(target), allowPrivate);
      const response = await fetch(target, {
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'application/xml, text/xml, */*',
          ...(client.userAgent ? { 'User-Agent': client.userAgent } : {}),
          ...(client.ipAddress ? { 'X-Forwarded-For': client.ipAddress } : {}),
        },
      });
      const next = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && next) {
        if (hop >= MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }
        target = new URL(next, target).toString();
        continue;
      }
      if (!response.ok) {
        throw new Error(`The ad server answered ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) {
        throw new Error('The answer is too large');
      }
      return new TextDecoder().decode(bytes);
    }
  };

/** Asks an ad server for an ad, and follows wrappers to the ad itself. */
@Injectable()
export class VastResolverService {
  /** Replaced by a test. */
  fetcher: (allowPrivate: boolean) => TagFetcher = fetchTag;

  /** The ad a tag leads to, or null when the ad server has none or fails. */
  async resolve(tag: string, client: AdClient): Promise<ResolvedAd | null> {
    const signal = AbortSignal.timeout(TIMEOUT_MS * 2);
    let extras = emptyExtras();
    let current = fillMacros(tag);
    try {
      for (let hop = 0; hop < MAX_HOPS; hop += 1) {
        const document = await this.fetcher(hop === 0)(current, client, signal);
        const parsed = parseVast(document);
        if (parsed.kind === 'inline') {
          return mergeExtras(extras, parsed.ad);
        }
        if (parsed.kind === 'empty') {
          return null;
        }
        extras = {
          impressions: [...extras.impressions, ...parsed.extras.impressions],
          errors: [...extras.errors, ...parsed.extras.errors],
          clickTracking: [...extras.clickTracking, ...parsed.extras.clickTracking],
          tracking: Object.fromEntries(
            Object.entries(extras.tracking).map(([event, list]) => [
              event,
              [...list, ...(parsed.extras.tracking[event as keyof typeof extras.tracking] ?? [])],
            ]),
          ) as typeof extras.tracking,
        };
        current = fillMacros(parsed.tagUri);
      }
    } catch {
      // An ad server that is slow, down or wrong costs the viewer nothing but the ad.
    }
    return null;
  }
}
