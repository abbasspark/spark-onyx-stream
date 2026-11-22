// SPDX-License-Identifier: AGPL-3.0-only
//
// The gateway counts what it sends with its own small script. These tests
// load that script, so the API and the gateway agree on who may read the
// figures, and check how the API works out what was sent between two answers.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlaybackToken } from '../playback/playback-token.js';
import { type GatewayCount, sentSince } from './origin-traffic.service.js';

interface GatewayScript {
  checkStatsToken(token: unknown, secret: unknown, nowSeconds: number): boolean;
}

const SCRIPT_PATH = path.resolve(import.meta.dirname, '../../../../deploy/nginx/njs/delivery.js');
const SECRET = 'a'.repeat(64);
const NOW = 1_800_000_000;

describe('the figures of the gateway', () => {
  let gateway: GatewayScript;
  beforeAll(async () => {
    const module = (await import(pathToFileURL(SCRIPT_PATH).href)) as { default: GatewayScript };
    gateway = module.default;
  });

  it('are given to the API, which asks with a token of its own kind', () => {
    const token = createPlaybackToken('gateway-stats', NOW + 60, SECRET);
    expect(gateway.checkStatsToken(token, SECRET, NOW)).toBe(true);
  });

  it('are given to nobody else', () => {
    const cases: [string, unknown, unknown][] = [
      ['a token that ran out', createPlaybackToken('gateway-stats', NOW - 1, SECRET), SECRET],
      ['a token for the tracker', createPlaybackToken('tracker', NOW + 60, SECRET), SECRET],
      [
        'a playback token',
        createPlaybackToken('01a1f8af-4c0c-74c7-8e65-401a1c55f177', NOW + 60, SECRET),
        SECRET,
      ],
      ['another secret', createPlaybackToken('gateway-stats', NOW + 60, 'b'.repeat(64)), SECRET],
      ['no token', '', SECRET],
      ['no secret', createPlaybackToken('gateway-stats', NOW + 60, SECRET), undefined],
      ['a short secret', createPlaybackToken('gateway-stats', NOW + 60, 'short'), 'short'],
      ['not text', 12345, SECRET],
    ];
    for (const [name, token, secret] of cases) {
      expect(gateway.checkStatsToken(token, secret, NOW), name).toBe(false);
    }
  });
});

describe('what the gateway sent between two answers', () => {
  const count = (since: number, video: number, live: number): GatewayCount => ({
    since,
    video: { bytes: video, requests: video / 100 },
    live: { bytes: live, requests: live / 100 },
  });

  it('is the difference', () => {
    expect(sentSince(count(1, 1000, 500), count(1, 4000, 500))).toEqual({
      since: 1,
      video: { bytes: 3000, requests: 30 },
      live: { bytes: 0, requests: 0 },
    });
  });

  it('is everything after the gateway started again', () => {
    // Another start time, or a counter that fell.
    expect(sentSince(count(1, 9000, 9000), count(2, 300, 100)).video.bytes).toBe(300);
    expect(sentSince(count(1, 9000, 9000), count(1, 300, 9100))).toMatchObject({
      video: { bytes: 300 },
      live: { bytes: 100 },
    });
    expect(sentSince(null, count(1, 700, 0)).video.bytes).toBe(700);
  });
});
