// SPDX-License-Identifier: AGPL-3.0-only
import { applyBeat, deviceOf, viewThreshold, visitorKeyOf } from './play-rules.js';

describe('deviceOf', () => {
  it('tells the kind of device from what the browser says', () => {
    expect(
      deviceOf(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      ),
    ).toBe('DESKTOP');
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBe(
      'DESKTOP',
    );
    expect(
      deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1'),
    ).toBe('MOBILE');
    expect(
      deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36'),
    ).toBe('MOBILE');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 13; SM-X710) Chrome/130 Safari/537.36')).toBe(
      'TABLET',
    );
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1')).toBe('TABLET');
    expect(deviceOf('Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) TV Safari/537.36')).toBe('TV');
    expect(deviceOf('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/108')).toBe('TV');
    expect(deviceOf('curl/8.4.0')).toBe('OTHER');
    expect(deviceOf(null)).toBe('OTHER');
  });
});

describe('visitorKeyOf', () => {
  const day = new Date('2026-12-10T10:00:00Z');
  it('is the same for a device during a day, and another the next day', () => {
    const key = visitorKeyOf('secret', day, '203.0.113.7', 'Browser');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorKeyOf('secret', new Date('2026-12-10T23:00:00Z'), '203.0.113.7', 'Browser')).toBe(
      key,
    );
    expect(
      visitorKeyOf('secret', new Date('2026-12-11T00:00:01Z'), '203.0.113.7', 'Browser'),
    ).not.toBe(key);
  });
  it('differs by device and by installation, and holds neither', () => {
    const key = visitorKeyOf('secret', day, '203.0.113.7', 'Browser') as string;
    expect(visitorKeyOf('secret', day, '203.0.113.8', 'Browser')).not.toBe(key);
    expect(visitorKeyOf('secret', day, '203.0.113.7', 'Other')).not.toBe(key);
    expect(visitorKeyOf('another', day, '203.0.113.7', 'Browser')).not.toBe(key);
    expect(key).not.toContain('203');
    expect(visitorKeyOf('secret', day, null, 'Browser')).toBeNull();
  });
});

describe('viewThreshold', () => {
  it('is thirty seconds, or half of a short video', () => {
    expect(viewThreshold(5400)).toBe(30);
    expect(viewThreshold(40)).toBe(20);
    expect(viewThreshold(0)).toBe(30);
  });
});

describe('applyBeat', () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
  const play = {
    durationSeconds: 600,
    watchedSeconds: 100,
    positionSeconds: 200,
    lastBeatAt: at(0),
  };

  it('adds what was watched and keeps the furthest point', () => {
    expect(applyBeat(play, { position: 230, watched: 30 }, at(30))).toEqual({
      watchedSeconds: 130,
      positionSeconds: 230,
    });
    // Going back does not undo how far the viewer got.
    expect(applyBeat(play, { position: 50, watched: 10 }, at(30)).positionSeconds).toBe(200);
  });

  it('does not believe more time than has passed', () => {
    expect(applyBeat(play, { position: 230, watched: 500 }, at(10)).watchedSeconds).toBe(115);
    expect(applyBeat(play, { position: 230, watched: 500 }, at(3600)).watchedSeconds).toBe(160);
    expect(applyBeat(play, { position: 230, watched: -50 }, at(30)).watchedSeconds).toBe(100);
  });

  it('keeps the point inside the video and the time within reason', () => {
    expect(applyBeat(play, { position: 99_999, watched: 0 }, at(30)).positionSeconds).toBe(600);
    expect(
      applyBeat({ ...play, watchedSeconds: 1795 }, { position: 10, watched: 30 }, at(30))
        .watchedSeconds,
    ).toBe(1800);
  });
});
