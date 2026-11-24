// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which network addresses this installation may send a request to.
 *
 * Addresses a viewer or an admin can name travel into the network the server
 * runs in, so they are checked before they are called. The rules live here
 * because more than one place needs them: webhooks, and the guide files the
 * installation fetches.
 */

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
 * Addresses that are never called: where cloud providers hand out
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
