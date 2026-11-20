// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Parses the Upload-Metadata header of the tus protocol:
 * comma-separated pairs of a key and a base64-encoded value, such as
 * "filename bW92aWUubXA0,assetId MDE5YS4uLg==". A key without a value is allowed.
 *
 * @returns The decoded pairs, or null when the header is malformed.
 */
export function parseUploadMetadata(header: string | undefined): Record<string, string> | null {
  const metadata: Record<string, string> = {};
  if (header === undefined || header.trim() === '') {
    return metadata;
  }

  for (const pair of header.split(',')) {
    const [key, value, ...rest] = pair.trim().split(' ');
    if (!key || rest.length > 0 || key in metadata) {
      return null;
    }

    if (value === undefined) {
      metadata[key] = '';
      continue;
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      return null;
    }
    metadata[key] = Buffer.from(value, 'base64').toString('utf8');
  }

  return metadata;
}

/** Encodes metadata for an Upload-Metadata header. Used by tests and clients. */
export function encodeUploadMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${Buffer.from(value, 'utf8').toString('base64')}`)
    .join(',');
}
