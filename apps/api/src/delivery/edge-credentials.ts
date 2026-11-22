// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * What an edge agent signs in with: "onyx-edge.<id of the edge>.<secret>".
 * The id finds the edge, the secret proves it. Only a hash of the secret is stored.
 */
const TOKEN_PREFIX = 'onyx-edge';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The version of the conversation between agent and main server. An agent
 * that speaks an older one is refused, so it is never sent viewers it cannot serve.
 */
export const EDGE_PROTOCOL = 1;

export function newEdgeSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashEdgeSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function formatEdgeToken(edgeId: string, secret: string): string {
  return `${TOKEN_PREFIX}.${edgeId}.${secret}`;
}

/** The parts of a token. Null when it does not have the form of one. */
export function parseEdgeToken(token: string): { edgeId: string; secret: string } | null {
  const [prefix, edgeId, secret, ...rest] = token.split('.');
  if (
    prefix !== TOKEN_PREFIX ||
    rest.length > 0 ||
    !edgeId ||
    !secret ||
    !ID_PATTERN.test(edgeId) ||
    !SECRET_PATTERN.test(secret)
  ) {
    return null;
  }
  return { edgeId, secret };
}

export function isEdgeSecret(candidate: string, secretHash: string): boolean {
  const given = Buffer.from(hashEdgeSecret(candidate));
  const expected = Buffer.from(secretHash);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The key playback tokens for one edge are signed with.
 *
 * Every edge has its own, made from the signing secret of the platform and
 * the edge's own secret. An edge can check the tokens of its viewers without
 * knowing the secret of the platform, so a server that is broken into cannot
 * make addresses for the main server or for other edges. Replacing the secret
 * of an edge replaces this key with it.
 */
export function edgeSigningKey(signingSecret: string, edgeId: string, secretHash: string): string {
  return createHmac('sha256', signingSecret).update(`edge:${edgeId}:${secretHash}`).digest('hex');
}
