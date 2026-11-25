// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { fillMacros, VastResolverService } from './vast-resolver.service.js';

const client = { ipAddress: '203.0.113.7', userAgent: 'TestBrowser/1' };

const inline = (media: string) =>
  `<VAST version="3.0"><Ad><InLine><Impression>https://i.example.com/imp</Impression><Creatives><Creative><Linear><Duration>00:00:10</Duration><MediaFiles><MediaFile type="video/mp4" width="640">${media}</MediaFile></MediaFiles></Linear></Creative></Creatives></InLine></Ad></VAST>`;
const wrapper = (next: string, imp: string) =>
  `<VAST version="3.0"><Ad><Wrapper><VASTAdTagURI>${next}</VASTAdTagURI><Impression>${imp}</Impression></Wrapper></Ad></VAST>`;

function resolverWith(documents: Record<string, string | Error>) {
  const asked: { url: string; allowPrivate: boolean }[] = [];
  const service = new VastResolverService();
  service.fetcher = (allowPrivate) => async (url) => {
    asked.push({ url, allowPrivate });
    const found = documents[url];
    if (found === undefined || found instanceof Error) {
      throw found ?? new Error('not found');
    }
    return found;
  };
  return { service, asked };
}

describe('fillMacros', () => {
  it('fills the cache buster and the timestamp', () => {
    const filled = fillMacros('https://a.example.com/?r=[CACHEBUSTING]&t=[TIMESTAMP]&x=[KEEP]');
    expect(filled).toMatch(/r=\d+&t=\d{4}-\d\d-\d\dT.*&x=\[KEEP\]/);
  });
});

describe('VastResolverService', () => {
  it('resolves an inline ad', async () => {
    const { service } = resolverWith({
      'https://a.example.com/vast': inline('https://c.example.com/a.mp4'),
    });
    const ad = await service.resolve('https://a.example.com/vast', client);
    expect(ad).toMatchObject({ mediaUrl: 'https://c.example.com/a.mp4', durationMs: 10_000 });
  });

  it('follows wrappers and collects what each one wants to be told, as a stranger', async () => {
    const { service, asked } = resolverWith({
      'https://a.example.com/vast': wrapper(
        'https://b.example.com/vast',
        'https://a.example.com/imp',
      ),
      'https://b.example.com/vast': wrapper(
        'https://c.example.com/vast',
        'https://b.example.com/imp',
      ),
      'https://c.example.com/vast': inline('https://c.example.com/a.mp4'),
    });
    const ad = await service.resolve('https://a.example.com/vast', client);
    expect(ad?.impressions).toEqual([
      'https://a.example.com/imp',
      'https://b.example.com/imp',
      'https://i.example.com/imp',
    ]);
    // The first address was typed in the panel. The others came from an ad server.
    expect(asked.map((call) => call.allowPrivate)).toEqual([true, false, false]);
  });

  it('gives up on a chain of wrappers that does not end', async () => {
    const documents: Record<string, string> = {};
    for (let n = 0; n < 10; n += 1) {
      documents[`https://w.example.com/${n}`] = wrapper(
        `https://w.example.com/${n + 1}`,
        'https://w.example.com/imp',
      );
    }
    const { service, asked } = resolverWith(documents);
    expect(await service.resolve('https://w.example.com/0', client)).toBeNull();
    expect(asked).toHaveLength(5);
  });

  it('has no ad when the server has none, fails, or answers nonsense', async () => {
    const { service } = resolverWith({
      'https://empty.example.com/': '<VAST version="3.0"></VAST>',
      'https://down.example.com/': new Error('boom'),
      'https://junk.example.com/': 'not xml',
    });
    expect(await service.resolve('https://empty.example.com/', client)).toBeNull();
    expect(await service.resolve('https://down.example.com/', client)).toBeNull();
    expect(await service.resolve('https://junk.example.com/', client)).toBeNull();
  });
});
