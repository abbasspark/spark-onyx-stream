// SPDX-License-Identifier: AGPL-3.0-only

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInfo {
  mimeType: ImageMimeType;
  /** File extension without the dot. */
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(data: Buffer): ImageInfo | null {
  // Signature, then the IHDR chunk: length, "IHDR", width, height.
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (data.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return {
    mimeType: 'image/png',
    extension: 'png',
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function readJpeg(data: Buffer): ImageInfo | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  // Walk the segments until a "start of frame" segment, which holds the size.
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      return null;
    }
    const marker = data[offset + 1] as number;
    // Fill bytes and markers without a length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }

    const length = data.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    // SOF0 to SOF15, without the three markers in that range that mean something else.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return {
        mimeType: 'image/jpeg',
        extension: 'jpg',
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(data: Buffer): ImageInfo | null {
  if (
    data.length < 30 ||
    data.toString('latin1', 0, 4) !== 'RIFF' ||
    data.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const format = data.toString('latin1', 12, 16);
  let size: { width: number; height: number } | null = null;

  if (format === 'VP8X') {
    // Extended format: width and height minus one, 24 bits each.
    size = { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
  } else if (format === 'VP8 ') {
    // Lossy: after the frame tag and the start code, 14 bits each.
    if (data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
      size = { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
  } else if (format === 'VP8L') {
    // Lossless: a signature byte, then 14 bits each, minus one, packed together.
    if (data[20] === 0x2f) {
      const bits = data.readUInt32LE(21);
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }

  return size ? { mimeType: 'image/webp', extension: 'webp', ...size } : null;
}

/**
 * Recognizes a JPEG, PNG or WebP picture by its content and reads its size.
 * The file name and the declared content type are never trusted.
 *
 * @returns Null when the data is none of the three formats or is damaged.
 */
export function readImageInfo(data: Buffer): ImageInfo | null {
  const info = readPng(data) ?? readJpeg(data) ?? readWebp(data);
  return info && info.width > 0 && info.height > 0 ? info : null;
}
