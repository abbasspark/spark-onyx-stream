// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readImageInfo } from './image-size.js';

/** A PNG file reduced to the part the reader looks at. */
function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

/** A JPEG with an APP0 segment before the frame segment, as real files have. */
function jpegHeader(width: number, height: number, frameMarker = 0xc0): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0)]);
  const frame = Buffer.alloc(19);
  frame[0] = 0xff;
  frame[1] = frameMarker;
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, frame]);
}

function webpExtended(width: number, height: number): Buffer {
  const data = Buffer.alloc(30);
  data.write('RIFF', 0, 'latin1');
  data.write('WEBP', 8, 'latin1');
  data.write('VP8X', 12, 'latin1');
  data.writeUIntLE(width - 1, 24, 3);
  data.writeUIntLE(height - 1, 27, 3);
  return data;
}

/** A lossy WebP: the frame tag, the start code, then both sizes. */
function webpLossy(width: number, height: number): Buffer {
  const data = Buffer.alloc(30);
  data.write('RIFF', 0, 'latin1');
  data.write('WEBP', 8, 'latin1');
  data.write('VP8 ', 12, 'latin1');
  Buffer.from([0x9d, 0x01, 0x2a]).copy(data, 23);
  data.writeUInt16LE(width, 26);
  data.writeUInt16LE(height, 28);
  return data;
}

/** A lossless WebP: a signature byte, then both sizes minus one, 14 bits each. */
function webpLossless(width: number, height: number): Buffer {
  const data = Buffer.alloc(30);
  data.write('RIFF', 0, 'latin1');
  data.write('WEBP', 8, 'latin1');
  data.write('VP8L', 12, 'latin1');
  data[20] = 0x2f;
  data.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21);
  return data;
}

describe('readImageInfo', () => {
  it('reads PNG', () => {
    expect(readImageInfo(pngHeader(1000, 1500))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 1000,
      height: 1500,
    });
  });

  it('reads baseline and progressive JPEG', () => {
    expect(readImageInfo(jpegHeader(1920, 1080))).toMatchObject({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 1920,
      height: 1080,
    });
    expect(readImageInfo(jpegHeader(600, 900, 0xc2))).toMatchObject({ width: 600, height: 900 });
  });

  it('reads WebP in the extended format', () => {
    expect(readImageInfo(webpExtended(1280, 720))).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
      width: 1280,
      height: 720,
    });
  });

  it('reads lossy and lossless WebP', () => {
    expect(readImageInfo(webpLossy(500, 750))).toMatchObject({
      mimeType: 'image/webp',
      width: 500,
      height: 750,
    });
    expect(readImageInfo(webpLossless(320, 180))).toMatchObject({
      mimeType: 'image/webp',
      width: 320,
      height: 180,
    });
    // Without the start code or the signature it is not a picture.
    expect(readImageInfo(webpLossy(500, 750).fill(0, 23, 26))).toBeNull();
    expect(readImageInfo(webpLossless(320, 180).fill(0, 20, 21))).toBeNull();
  });

  it('rejects everything that is not a picture', () => {
    expect(readImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(readImageInfo(Buffer.from('GIF89a'.padEnd(40, '\0')))).toBeNull();
    expect(readImageInfo(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
    expect(readImageInfo(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('rejects damaged files and a size of zero', () => {
    expect(readImageInfo(pngHeader(0, 100))).toBeNull();
    expect(readImageInfo(pngHeader(100, 100).subarray(0, 20))).toBeNull();
    // A JPEG whose segments never reach a frame.
    expect(
      readImageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xd9, 0, 0])),
    ).toBeNull();
    // Garbage where a segment marker should be.
    expect(
      readImageInfo(Buffer.from([0xff, 0xd8, 0x12, 0x34, 0x56, 0x78, 0, 0, 0, 0, 0, 0])),
    ).toBeNull();
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Not every FFmpeg build can write WebP. The one from Homebrew often cannot. */
function hasWebpEncoder(): boolean {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', '-encoders'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .includes('libwebp');
  } catch {
    return false;
  }
}

// Real files written by FFmpeg guard against mistakes in the hand-built headers above.
describe.skipIf(!hasFfmpeg())('readImageInfo with real files', () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'onyx-image-'));
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function generate(name: string, size: string, extra: string[] = []): Buffer {
    const file = path.join(directory, name);
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc=size=${size}`,
        '-frames:v',
        '1',
        ...extra,
        file,
      ],
      { stdio: 'ignore' },
    );
    return readFileSync(file);
  }

  it('reads a real JPEG', () => {
    expect(readImageInfo(generate('a.jpg', '640x960'))).toMatchObject({
      mimeType: 'image/jpeg',
      width: 640,
      height: 960,
    });
  });

  it('reads a real PNG', () => {
    expect(readImageInfo(generate('a.png', '1280x720'))).toMatchObject({
      mimeType: 'image/png',
      width: 1280,
      height: 720,
    });
  });

  it.skipIf(!hasWebpEncoder())('reads real lossy and lossless WebP', () => {
    expect(readImageInfo(generate('lossy.webp', '500x750'))).toMatchObject({
      mimeType: 'image/webp',
      width: 500,
      height: 750,
    });
    expect(readImageInfo(generate('lossless.webp', '320x180', ['-lossless', '1']))).toMatchObject({
      mimeType: 'image/webp',
      width: 320,
      height: 180,
    });
  });
});
