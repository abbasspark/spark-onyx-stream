// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { Channel } from '@/api/types';
import {
  describeProbePlan,
  describeQualities,
  exceedsSource,
  isFallingBehind,
  describeStreams,
  encoderAddresses,
  formatUptime,
  isChannelFilter,
  matchesFilter,
  matchesSearch,
  needsAttention,
  parseChannelNumber,
  protocolOf,
  qualityName,
  sourceText,
  statusLook,
  toggleQuality,
  totalsOf,
} from './channels';

const channel = (change: Partial<Channel> = {}): Channel => ({
  id: 'c1',
  name: 'News 24',
  slug: 'news-24',
  number: 7,
  description: null,
  ingest: 'PULL',
  source: 'https://cdn.example.com/…/live.m3u8',
  mode: 'COPY',
  qualities: [],
  outputs: null,
  enabled: true,
  status: 'RUNNING',
  statusMessage: null,
  startedAt: '2026-11-21T10:00:00.000Z',
  restartCount: 0,
  streams: null,
  health: { bitrate: 4_000_000, speed: 1, lastDataAt: null, node: 'live-1' },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
  ...change,
});

const streams = {
  videoCodec: 'h264',
  width: 1920,
  height: 1080,
  frameRate: 25,
  audioCodec: 'aac',
  audioChannels: 2,
};

describe('statusLook', () => {
  it('calls a running channel on air', () => {
    expect(statusLook('RUNNING')).toEqual({ label: 'On air', tone: 'success', live: true });
    expect(statusLook('FAILED').tone).toBe('danger');
    expect(statusLook('STOPPED').live).toBe(false);
  });
});

describe('filters', () => {
  const running = channel();
  const failed = channel({ status: 'FAILED', statusMessage: 'No answer', health: null });
  const reconnecting = channel({ status: 'RECONNECTING', health: null });
  const justStarted = channel({ status: 'WAITING', health: null });
  const unattended = channel({ status: 'WAITING', statusMessage: 'No live process', health: null });
  const stopped = channel({ status: 'STOPPED', enabled: false, health: null });

  it('knows which channels need someone to look', () => {
    expect(
      [running, failed, reconnecting, justStarted, unattended, stopped].map(needsAttention),
    ).toEqual([false, true, true, false, true, false]);
  });

  it('narrows the list', () => {
    const all = [running, failed, stopped];
    expect(all.filter((item) => matchesFilter(item, 'all'))).toHaveLength(3);
    expect(all.filter((item) => matchesFilter(item, 'on-air'))).toEqual([running]);
    expect(all.filter((item) => matchesFilter(item, 'attention'))).toEqual([failed]);
    expect(all.filter((item) => matchesFilter(item, 'stopped'))).toEqual([stopped]);
  });

  it('accepts only known filters from the address', () => {
    expect(isChannelFilter('on-air')).toBe(true);
    expect(isChannelFilter('everything')).toBe(false);
    expect(isChannelFilter(null)).toBe(false);
  });

  it('adds the figures up', () => {
    expect(totalsOf([running, running, failed, stopped])).toEqual({
      total: 4,
      onAir: 2,
      attention: 1,
      stopped: 1,
      bitrate: 8_000_000,
    });
  });
});

describe('matchesSearch', () => {
  it('finds by name, number and source, every word', () => {
    expect(matchesSearch(channel(), 'news')).toBe(true);
    expect(matchesSearch(channel(), '7')).toBe(true);
    expect(matchesSearch(channel(), 'cdn.example')).toBe(true);
    expect(matchesSearch(channel(), 'news 24 cdn')).toBe(true);
    expect(matchesSearch(channel(), 'news sports')).toBe(false);
    expect(matchesSearch(channel(), '  ')).toBe(true);
  });
});

describe('describing a source', () => {
  it('names the picture and the sound', () => {
    expect(describeStreams(streams)).toBe('1080p · 25 fps · H.264 · AAC stereo');
    expect(
      describeStreams({
        ...streams,
        height: 2160,
        frameRate: 59.94,
        videoCodec: 'hevc',
        audioCodec: 'eac3',
        audioChannels: 6,
      }),
    ).toBe('4K · 59.94 fps · HEVC · E-AC-3 5.1');
    expect(describeStreams({ ...streams, frameRate: null, audioCodec: null })).toBe(
      '1080p · H.264 · no audio',
    );
    expect(qualityName(720)).toBe('720p');
  });

  it('says what happens to a tested source', () => {
    const probe = { ok: true as const, streams, audio: 'copy' as const, copyObstacle: null };
    expect(describeProbePlan(probe, 'COPY')).toContain('untouched');
    expect(
      describeProbePlan(
        { ...probe, streams: { ...streams, audioCodec: 'mp2' }, audio: 'aac' },
        'COPY',
      ),
    ).toContain('MP2 audio is converted to AAC');
    expect(describeProbePlan({ ...probe, audio: 'none' }, 'COPY')).toContain('silent');
    expect(describeProbePlan({ ...probe, copyObstacle: 'Needs H.264' }, 'COPY')).toBe(
      'Needs H.264.',
    );
    expect(describeProbePlan({ ...probe, copyObstacle: 'Needs H.264' }, 'TRANSCODE')).toContain(
      'encoded again',
    );
  });

  it('reads the protocol', () => {
    expect(protocolOf('https://cdn.example.com/a.m3u8')).toBe('HTTPS');
    expect(protocolOf('srt://203.0.113.9:9000')).toBe('SRT');
    expect(protocolOf('nonsense')).toBe('');
  });
});

describe('formatUptime', () => {
  const now = new Date('2026-11-21T12:00:00.000Z').getTime();
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('grows from seconds to days', () => {
    expect(formatUptime(null, now)).toBe('–');
    expect(formatUptime(ago(42), now)).toBe('42 s');
    expect(formatUptime(ago(12 * 60 + 5), now)).toBe('12 min');
    expect(formatUptime(ago(3 * 3600 + 5 * 60), now)).toBe('3 h 5 min');
    expect(formatUptime(ago(2 * 86_400 + 4 * 3600), now)).toBe('2 d 4 h');
  });
});

describe('parseChannelNumber', () => {
  it('reads a number, nothing, or refuses', () => {
    expect(parseChannelNumber(' 12 ')).toBe(12);
    expect(parseChannelNumber('')).toBeNull();
    expect(parseChannelNumber('0')).toBeUndefined();
    expect(parseChannelNumber('12a')).toBeUndefined();
    expect(parseChannelNumber('10000')).toBeUndefined();
  });
});

describe('qualities', () => {
  it('adds and removes, best first', () => {
    expect(toggleQuality([1080, 480], 720)).toEqual([1080, 720, 480]);
    expect(toggleQuality([1080, 720], 1080)).toEqual([720]);
  });

  it('knows which are more than the source has', () => {
    expect(exceedsSource(1080, { ...streams, height: 720 })).toBe(true);
    expect(exceedsSource(1080, { ...streams, height: 1072 })).toBe(false);
    expect(exceedsSource(1080, null)).toBe(false);
  });

  it('names what a channel sends, or what was chosen', () => {
    expect(describeQualities({ qualities: [1080, 720], outputs: null })).toBe('1080p, 720p');
    expect(
      describeQualities({
        qualities: [1080, 720],
        outputs: [{ name: '576p', height: 576, videoKbps: 1950 }],
      }),
    ).toBe('576p');
  });

  it('notices a server that cannot keep up', () => {
    const health = { bitrate: 1, lastDataAt: null, node: 'n' };
    const slow = channel({ mode: 'TRANSCODE', health: { ...health, speed: 0.8 } });
    expect(isFallingBehind(slow)).toBe(true);
    expect(isFallingBehind({ ...slow, health: { ...health, speed: 1 } })).toBe(false);
    expect(isFallingBehind({ ...slow, mode: 'COPY' })).toBe(false);
    expect(isFallingBehind({ ...slow, status: 'STARTING' })).toBe(false);
    expect(isFallingBehind({ ...slow, health: null })).toBe(false);
  });
});

describe('channels pushed by an encoder', () => {
  const pushed = channel({ ingest: 'PUSH', source: '', status: 'IDLE', health: null });

  it('wait for their encoder, which is nothing to worry about', () => {
    expect(statusLook('IDLE')).toMatchObject({ label: 'Waiting for encoder', tone: 'info' });
    expect(needsAttention(pushed)).toBe(false);
    expect(
      needsAttention({ ...pushed, statusMessage: 'The ingest server cannot be reached' }),
    ).toBe(true);
  });

  it('are found by how they get their video', () => {
    expect(sourceText(pushed)).toBe('Pushed by an encoder');
    expect(sourceText(channel())).toBe('https://cdn.example.com/…/live.m3u8');
    expect(matchesSearch(pushed, 'encoder')).toBe(true);
  });

  it('use the addresses of the server, or the host of the panel', () => {
    expect(
      encoderAddresses(
        { streamKey: 'KEY', rtmpServer: null, rtmpUrl: null, srtUrl: null },
        'tv.example.com',
      ),
    ).toEqual({
      rtmpServer: 'rtmp://tv.example.com:1935/live',
      streamKey: 'KEY',
      srtUrl: 'srt://tv.example.com:8890?streamid=publish:live/KEY',
    });
    expect(
      encoderAddresses(
        {
          streamKey: 'KEY',
          rtmpServer: 'rtmp://in.example.com:1935/live',
          rtmpUrl: 'rtmp://in.example.com:1935/live/KEY',
          srtUrl: 'srt://in.example.com:8890?streamid=publish:live/KEY',
        },
        'tv.example.com',
      ).rtmpServer,
    ).toBe('rtmp://in.example.com:1935/live');
  });
});
