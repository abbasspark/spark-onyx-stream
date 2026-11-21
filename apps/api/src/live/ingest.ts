// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LiveSource } from './live-source.js';

/** The name the platform itself signs in to the ingest server with. */
export const INGEST_USER = 'onyx';

/** First part of every path on the ingest server: "live/<stream key>". */
const PATH_PREFIX = 'live/';
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * The password the platform signs in to the ingest server with, to read the
 * streams and to ask which ones are there. Made from the signing secret, so
 * there is nothing more to configure and nothing to keep in step.
 */
export function ingestPassword(signingSecret: string): string {
  return createHmac('sha256', signingSecret).update('onyx-ingest-internal').digest('hex');
}

export function isIngestPassword(candidate: string, signingSecret: string): boolean {
  const expected = Buffer.from(ingestPassword(signingSecret));
  const given = Buffer.from(candidate);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A new stream key: 32 characters an encoder can carry in an address. */
export function newStreamKey(): string {
  return randomBytes(24).toString('base64url');
}

/** What is stored to find a channel by its stream key. */
export function hashStreamKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function ingestPath(key: string): string {
  return `${PATH_PREFIX}${key}`;
}

/** The stream key in a path of the ingest server. Null for any other path. */
export function keyOfPath(path: string): string | null {
  if (!path.startsWith(PATH_PREFIX)) {
    return null;
  }
  const key = path.slice(PATH_PREFIX.length);
  return KEY_PATTERN.test(key) ? key : null;
}

/** Where a live process reads the stream an encoder pushes. Never shown to anyone. */
export function encoderSource(rtspUrl: string, key: string, signingSecret: string): LiveSource {
  const url = new URL(`${rtspUrl.replace(/\/+$/, '')}/${ingestPath(key)}`);
  url.username = INGEST_USER;
  url.password = ingestPassword(signingSecret);
  return { url: url.toString(), protocol: 'rtsp:', label: 'the encoder' };
}

/** What an admin enters in an encoder. */
export interface EncoderSettings {
  streamKey: string;
  /** "Server" in OBS and similar. Null when the address is not configured: the panel then uses its own host name. */
  rtmpServer: string | null;
  /** The complete address for encoders that take one. */
  rtmpUrl: string | null;
  srtUrl: string | null;
}

export function encoderSettings(
  key: string,
  publicUrls: { rtmp: string | null; srt: string | null },
): EncoderSettings {
  const rtmpServer = publicUrls.rtmp ? `${publicUrls.rtmp.replace(/\/+$/, '')}/live` : null;
  return {
    streamKey: key,
    rtmpServer,
    rtmpUrl: rtmpServer ? `${rtmpServer}/${key}` : null,
    srtUrl: publicUrls.srt
      ? `${publicUrls.srt.replace(/\/+$/, '')}?streamid=publish:${ingestPath(key)}`
      : null,
  };
}
