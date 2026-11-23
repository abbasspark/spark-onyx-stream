// SPDX-License-Identifier: AGPL-3.0-only
import { isIP } from 'node:net';

/**
 * Which addresses a webhook may be sent to.
 * - "any": also private and local ones, for a receiver on the same network.
 * - "public": only addresses on the internet.
 */
export type TargetMode = 'any' | 'public';

function ipv4Parts(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

/** The IPv4 address inside an IPv6 one that only wraps it ("::ffff:10.0.0.1"). */
function unwrap(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] ?? address;
}

/**
 * Addresses that are never a webhook: where cloud providers hand out
 * credentials to whoever asks from inside the machine, and "no address".
 */
export function isForbiddenAddress(raw: string): boolean {
  const address = unwrap(raw.toLowerCase());
  const v4 = ipv4Parts(address);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    // 169.254.0.0/16 is link-local, home of the metadata service. 0.0.0.0/8 is "this host".
    return (a === 169 && b === 254) || a === 0;
  }
  // fe80::/10 link-local, fd00:ec2::254 the metadata service over IPv6, :: unspecified.
  return /^fe[89ab]/.test(address) || address.startsWith('fd00:ec2:') || address === '::';
}

/** Addresses of the machine itself and of private networks. */
export function isPrivateAddress(raw: string): boolean {
  const address = unwrap(raw.toLowerCase());
  const v4 = ipv4Parts(address);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      // Shared address space of carriers.
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  // ::1 loopback, fc00::/7 unique local.
  return address === '::1' || /^f[cd]/.test(address);
}

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
