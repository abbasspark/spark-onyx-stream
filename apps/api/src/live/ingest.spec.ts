// SPDX-License-Identifier: AGPL-3.0-only
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  encoderSettings,
  encoderSource,
  hashStreamKey,
  ingestPassword,
  isIngestPassword,
  keyOfPath,
  newStreamKey,
} from './ingest.js';
import { IngestClient } from './ingest-client.js';
import { inputOptions } from './live-source.js';

const SECRET = 'a'.repeat(64);

describe('stream keys', () => {
  it('are long, different every time and fit in an address', () => {
    const keys = new Set(Array.from({ length: 50 }, newStreamKey));
    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(keyOfPath(`live/${key}`)).toBe(key);
    }
  });

  it('are found again by their hash, which gives nothing away', () => {
    expect(hashStreamKey('abc')).toBe(hashStreamKey('abc'));
    expect(hashStreamKey('abc')).not.toBe(hashStreamKey('abd'));
    expect(hashStreamKey('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('are only read from paths of the right shape', () => {
    expect(keyOfPath('live/short')).toBeNull();
    expect(keyOfPath('other/abcdefghijklmnop1234')).toBeNull();
    expect(keyOfPath('live/abcdefghijklmnop1234/more')).toBeNull();
    expect(keyOfPath('live/../../etc/passwd-aaaaaaaa')).toBeNull();
    expect(keyOfPath('')).toBeNull();
  });
});

describe('the password of the platform', () => {
  it('follows from the signing secret and nothing else', () => {
    expect(ingestPassword(SECRET)).toBe(ingestPassword(SECRET));
    expect(ingestPassword(SECRET)).not.toBe(ingestPassword('b'.repeat(64)));
    expect(isIngestPassword(ingestPassword(SECRET), SECRET)).toBe(true);
    expect(isIngestPassword('guess', SECRET)).toBe(false);
    expect(isIngestPassword('', SECRET)).toBe(false);
  });
});

describe('encoderSource', () => {
  it('reads the stream with the password of the platform, and never shows where', () => {
    const source = encoderSource('rtsp://ingest:8554/', 'abcdefghijklmnop1234', SECRET);
    expect(source.url).toBe(
      `rtsp://onyx:${ingestPassword(SECRET)}@ingest:8554/live/abcdefghijklmnop1234`,
    );
    expect(source.label).toBe('the encoder');
    expect(inputOptions(source)).toEqual(expect.arrayContaining(['-rtsp_transport', 'tcp']));
  });
});

describe('encoderSettings', () => {
  it('gives what OBS asks for, and one address for encoders that take one', () => {
    expect(
      encoderSettings('KEY', {
        rtmp: 'rtmp://stream.example.com:1935',
        srt: 'srt://stream.example.com:8890',
      }),
    ).toEqual({
      streamKey: 'KEY',
      rtmpServer: 'rtmp://stream.example.com:1935/live',
      rtmpUrl: 'rtmp://stream.example.com:1935/live/KEY',
      srtUrl: 'srt://stream.example.com:8890?streamid=publish:live/KEY',
    });
  });

  it('leaves addresses that are not configured to the panel', () => {
    expect(encoderSettings('KEY', { rtmp: null, srt: null })).toEqual({
      streamKey: 'KEY',
      rtmpServer: null,
      rtmpUrl: null,
      srtUrl: null,
    });
  });
});

describe('IngestClient', () => {
  let server: Server;
  let client: IngestClient;
  const requests: { method: string; url: string; authorization: string }[] = [];
  let paths: Record<string, unknown> = {};

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: request.headers.authorization ?? '',
      });
      const path = (request.url ?? '').replace('/v3/paths/get/', '');
      if (request.method === 'GET' && path in paths) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(paths[path]));
      } else {
        response.statusCode = request.method === 'POST' ? 200 : 404;
        response.end('{}');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    client = new IngestClient({
      playbackSigningSecret: SECRET,
      ingest: { apiUrl: `http://127.0.0.1:${port}` },
    } as never);
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => {
    requests.length = 0;
    paths = {};
  });

  it('says whether an encoder is sending, signed in as the platform', async () => {
    paths['live/key-with-an-encoder'] = { ready: true, source: { type: 'rtmpConn', id: 'c1' } };
    paths['live/key-that-is-waiting'] = { ready: false, source: null };

    expect(await client.state('key-with-an-encoder')).toBe('ready');
    expect(await client.state('key-that-is-waiting')).toBe('absent');
    expect(await client.state('key-nobody-knows')).toBe('absent');

    const expected = `Basic ${Buffer.from(`onyx:${ingestPassword(SECRET)}`).toString('base64')}`;
    expect(requests.every((request) => request.authorization === expected)).toBe(true);
  });

  it('closes the connection of an encoder by its kind', async () => {
    paths['live/rtmp-key'] = { ready: true, source: { type: 'rtmpConn', id: 'c1' } };
    paths['live/srt-key'] = { ready: true, source: { type: 'srtConn', id: 'c2' } };
    await client.kick('rtmp-key');
    await client.kick('srt-key');
    await client.kick('nobody');

    expect(
      requests.filter((request) => request.method === 'POST').map((request) => request.url),
    ).toEqual(['/v3/rtmpconns/kick/c1', '/v3/srtconns/kick/c2']);
  });

  it('reports an ingest server that does not answer, and does not throw', async () => {
    const away = new IngestClient({
      playbackSigningSecret: SECRET,
      ingest: { apiUrl: 'http://127.0.0.1:1' },
    } as never);
    expect(await away.state('any-key')).toBe('unreachable');
    await expect(away.kick('any-key')).resolves.toBeUndefined();
  });
});
