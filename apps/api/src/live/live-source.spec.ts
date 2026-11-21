// SPDX-License-Identifier: AGPL-3.0-only
import { inputOptions, InvalidSourceError, parseSource } from './live-source.js';

describe('parseSource', () => {
  it.each([
    ['https://cdn.example.com/live/index.m3u8', 'https:'],
    ['http://10.0.0.5:8080/stream.ts', 'http:'],
    ['rtmp://encoder.example.com/live/key', 'rtmp:'],
    ['rtmps://encoder.example.com/live/key', 'rtmps:'],
    ['srt://203.0.113.9:9000?mode=caller', 'srt:'],
    ['udp://239.1.1.1:5000', 'udp:'],
    ['rtp://239.1.1.1:5004', 'rtp:'],
  ])('accepts %s', (url, protocol) => {
    expect(parseSource(`  ${url} `)).toMatchObject({ url, protocol });
  });

  it.each([
    '/etc/passwd',
    'file:///etc/passwd',
    'concat:/etc/passwd|/etc/hosts',
    'pipe:0',
    'ftp://example.com/video.ts',
    'not an address',
    'https://exa mple.com/a.m3u8',
    'https://',
  ])('refuses %s', (value) => {
    expect(() => parseSource(value)).toThrow(InvalidSourceError);
  });

  it('keeps passwords, keys and tokens out of the label', () => {
    expect(parseSource('https://user:secret@cdn.example.com/a/b/live.m3u8?token=abc').label).toBe(
      'https://cdn.example.com/…/live.m3u8',
    );
    expect(parseSource('http://iptv.example.com:8080/live/account/password/42.ts').label).toBe(
      'http://iptv.example.com:8080/…/42.ts',
    );
    expect(parseSource('https://cdn.example.com/live.m3u8').label).toBe(
      'https://cdn.example.com/live.m3u8',
    );
    expect(parseSource('rtmp://encoder.example.com/live/stream-key').label).toBe(
      'rtmp://encoder.example.com/live/…',
    );
    expect(parseSource('srt://203.0.113.9:9000?passphrase=secret').label).toBe(
      'srt://203.0.113.9:9000',
    );
  });
});

describe('inputOptions', () => {
  const protocols = (url: string): string => {
    const options = inputOptions(parseSource(url));
    return options[options.indexOf('-protocol_whitelist') + 1] as string;
  };

  it('never lets a source reach local files', () => {
    for (const url of [
      'https://example.com/a.m3u8',
      'rtmp://example.com/live/key',
      'srt://example.com:9000',
      'udp://239.1.1.1:5000',
      'rtp://239.1.1.1:5004',
    ]) {
      expect(protocols(url).split(',')).not.toContain('file');
    }
  });

  it('reconnects web sources by itself', () => {
    expect(inputOptions(parseSource('https://example.com/a.m3u8'))).toEqual(
      expect.arrayContaining(['-reconnect', '-reconnect_streamed', '-rw_timeout']),
    );
  });
});
