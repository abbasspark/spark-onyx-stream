// SPDX-License-Identifier: AGPL-3.0-only
import { isIP } from 'node:net';
import { isForbiddenAddress, isPrivateAddress } from '../common/outbound-address.js';

export { isForbiddenAddress, isPrivateAddress };

/**
 * Which addresses a webhook may be sent to.
 * - "any": also private and local ones, for a receiver on the same network.
 * - "public": only addresses on the internet.
 */
export type TargetMode = 'any' | 'public';

/** Why an address must not be sent to. Null: it may. */
export function addressProblem(address: string, mode: TargetMode): string | null {
  if (isForbiddenAddress(address)) {
    return 'This address is reserved for the machine itself and is never used for webhooks';
  }
  if (mode === 'public' && isPrivateAddress(address)) {
    return 'This installation only sends webhooks to addresses on the internet (WEBHOOK_TARGETS=public)';
  }
  return null;
}

/**
 * Checks the address of a webhook as it is typed: an http or https URL
 * without a password in it, and not pointing at a forbidden place by its
 * name alone. Where a host name leads is checked again each time it is used.
 *
 * @returns What is wrong with it, or null.
 */
export function urlProblem(value: string, mode: TargetMode): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a full address, like https://example.com/hooks/onyx';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'The address has to start with https:// or http://';
  }
  if (url.username || url.password) {
    return 'Leave user name and password out of the address. The signature is what proves who sends';
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    return addressProblem(host, mode);
  }
  if (mode === 'public' && (host === 'localhost' || host.endsWith('.localhost'))) {
    return 'This installation only sends webhooks to addresses on the internet (WEBHOOK_TARGETS=public)';
  }
  return null;
}
