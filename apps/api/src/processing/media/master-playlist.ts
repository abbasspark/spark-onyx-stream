// SPDX-License-Identifier: AGPL-3.0-only

/** One variant listed in an HLS multivariant playlist. */
export interface PlaylistVariant {
  /** Path of the media playlist, relative to the multivariant playlist. */
  uri: string;
  /** Peak bitrate in bits per second. */
  bandwidth: number;
  width: number | null;
  height: number | null;
  codecs: string | null;
}

/** Splits an attribute list such as BANDWIDTH=1,CODECS="a,b" at the commas outside quotes. */
function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
    const key = match[1] as string;
    const value = match[2] as string;
    attributes[key] = value.startsWith('"') ? value.slice(1, -1) : value;
  }
  return attributes;
}

/**
 * Reads the variants from the multivariant playlist FFmpeg writes.
 * Used to record what was actually produced: output size, bitrate and codecs.
 */
export function parseMasterPlaylist(content: string): PlaylistVariant[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const variants: PlaylistVariant[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (!line.startsWith('#EXT-X-STREAM-INF:')) {
      continue;
    }

    const uri = lines.slice(index + 1).find((next) => next.length > 0 && !next.startsWith('#'));
    if (!uri) {
      continue;
    }

    const attributes = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
    const [width, height] = (attributes.RESOLUTION ?? '').split('x').map(Number);

    variants.push({
      uri,
      bandwidth: Number(attributes.BANDWIDTH ?? 0),
      width: width && Number.isFinite(width) ? width : null,
      height: height && Number.isFinite(height) ? height : null,
      codecs: attributes.CODECS ?? null,
    });
  }

  return variants;
}
