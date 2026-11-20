// SPDX-License-Identifier: AGPL-3.0-only
//
// The Nginx gateway checks playback tokens with its own small script. These
// tests load that script and make sure it agrees with the API on every case,
// so the two can never drift apart unnoticed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlaybackToken, verifyPlaybackToken } from './playback-token.js';

interface GatewayScript {
  checkToken(assetId: unknown, token: unknown, secret: unknown, nowSeconds: number): boolean;
}

const SCRIPT_PATH = path.resolve(import.meta.dirname, '../../../../deploy/nginx/njs/media.js');
const SECRET = 'a'.repeat(64);
const ASSET_ID = '01a1f8af-4c0c-74c7-8e65-401a1c55f177';
const NOW = 1_800_000_000;

describe('Nginx playback token check', () => {
  let gateway: GatewayScript;

  beforeAll(async () => {
    const module = (await import(pathToFileURL(SCRIPT_PATH).href)) as { default: GatewayScript };
    gateway = module.default;
  });

  it('accepts a token the API created', () => {
    const token = createPlaybackToken(ASSET_ID, NOW + 60, SECRET);

    expect(gateway.checkToken(ASSET_ID, token, SECRET, NOW)).toBe(true);
  });

  it('agrees with the API on every kind of bad token', () => {
    const valid = createPlaybackToken(ASSET_ID, NOW + 60, SECRET);
    const [expiry, signature] = valid.split('.') as [string, string];
    const otherAsset = '01a1f8af-4c0c-74c7-8e65-401a1c55f178';

    const cases: [string, string, string][] = [
      ['expired', ASSET_ID, createPlaybackToken(ASSET_ID, NOW - 1, SECRET)],
      ['expiring this second', ASSET_ID, createPlaybackToken(ASSET_ID, NOW, SECRET)],
      ['for another asset', otherAsset, valid],
      [
        'signed with another secret',
        ASSET_ID,
        createPlaybackToken(ASSET_ID, NOW + 60, 'b'.repeat(64)),
      ],
      ['with a later expiry and the old signature', ASSET_ID, `${NOW + 9999}.${signature}`],
      [
        'with a changed signature',
        ASSET_ID,
        `${expiry}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`,
      ],
      ['with a short signature', ASSET_ID, `${expiry}.${signature.slice(1)}`],
      ['without a separator', ASSET_ID, `${expiry}${signature}`],
      ['with a negative expiry', ASSET_ID, `-5.${signature}`],
      ['with a decimal expiry', ASSET_ID, `${expiry}.5.${signature}`],
      ['empty', ASSET_ID, ''],
      ['valid again as a control', ASSET_ID, valid],
    ];

    for (const [name, assetId, token] of cases) {
      const api = verifyPlaybackToken(token, assetId, SECRET, NOW).valid;
      expect(gateway.checkToken(assetId, token, SECRET, NOW), name).toBe(api);
    }
  });

  it('refuses everything when the secret is missing or too short', () => {
    const shortSecret = 'short';
    const token = createPlaybackToken(ASSET_ID, NOW + 60, shortSecret);

    expect(gateway.checkToken(ASSET_ID, token, shortSecret, NOW)).toBe(false);
    expect(gateway.checkToken(ASSET_ID, token, undefined, NOW)).toBe(false);
    expect(gateway.checkToken(ASSET_ID, token, '', NOW)).toBe(false);
  });

  it('refuses asset ids that are not UUIDs and values that are not text', () => {
    const token = createPlaybackToken('../../etc', NOW + 60, SECRET);

    expect(gateway.checkToken('../../etc', token, SECRET, NOW)).toBe(false);
    expect(gateway.checkToken(undefined, undefined, SECRET, NOW)).toBe(false);
  });
});
