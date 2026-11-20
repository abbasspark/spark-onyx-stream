// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Playback tokens authorize reading the generated files of one asset until a
 * given time. A token is "<expiry>.<signature>":
 *
 *   expiry     Unix time in seconds after which the token is refused
 *   signature  HMAC-SHA256 over "<assetId>:<expiry>", in base64url
 *
 * The token sits in the URL path, in front of the file path:
 *
 *   /v1/media/<assetId>/<token>/hls/master.m3u8
 *
 * Playlists refer to their segments with relative paths, so every request of
 * a playback session carries the same token without any playlist rewriting.
 * The signature covers the asset and not a single file, so one token opens
 * the manifest and all its segments.
 */

function signature(assetId: string, expiresAtSeconds: number, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${assetId}:${expiresAtSeconds}`).digest();
}

export function createPlaybackToken(
  assetId: string,
  expiresAtSeconds: number,
  secret: string,
): string {
  return `${expiresAtSeconds}.${signature(assetId, expiresAtSeconds, secret).toString('base64url')}`;
}

export type TokenCheck =
  { valid: true } | { valid: false; reason: 'malformed' | 'expired' | 'signature' };

/**
 * Checks a token for an asset.
 *
 * @param nowSeconds Current Unix time in seconds. A parameter so tests can set the clock.
 */
export function verifyPlaybackToken(
  token: string,
  assetId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TokenCheck {
  const separator = token.indexOf('.');
  if (separator <= 0) {
    return { valid: false, reason: 'malformed' };
  }

  const expiryText = token.slice(0, separator);
  const signatureText = token.slice(separator + 1);
  if (!/^\d{1,12}$/.test(expiryText) || !/^[A-Za-z0-9_-]{43}$/.test(signatureText)) {
    return { valid: false, reason: 'malformed' };
  }

  const expiresAtSeconds = Number(expiryText);
  const expected = signature(assetId, expiresAtSeconds, secret);
  const given = Buffer.from(signatureText, 'base64url');

  // The signature is checked before the expiry, so a forged token learns nothing about time.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { valid: false, reason: 'signature' };
  }
  if (expiresAtSeconds <= nowSeconds) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true };
}
