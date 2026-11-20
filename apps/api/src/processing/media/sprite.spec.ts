// SPDX-License-Identifier: AGPL-3.0-only
import { buildSpriteArgs, buildSpriteVtt, planSprite } from './sprite.js';

describe('planSprite', () => {
  it('takes a picture every two seconds for a short video', () => {
    expect(planSprite(13_000, 1280, 720)).toEqual({
      intervalSeconds: 2,
      count: 6,
      columns: 6,
      rows: 1,
      tileWidth: 160,
      tileHeight: 90,
    });
  });

  it('widens the interval so a long video fits one sheet', () => {
    const plan = planSprite(2 * 60 * 60 * 1000, 1920, 1080);

    expect(plan).toMatchObject({ intervalSeconds: 72, count: 100, columns: 10, rows: 10 });
  });

  it('keeps the aspect ratio with an even height', () => {
    expect(planSprite(60_000, 1920, 800)?.tileHeight).toBe(66);
    expect(planSprite(60_000, 720, 1280)?.tileHeight).toBe(284);
  });

  it('starts a new row after ten pictures', () => {
    expect(planSprite(50_000, 1280, 720)).toMatchObject({ count: 25, columns: 10, rows: 3 });
  });

  it('returns null for a very short video', () => {
    expect(planSprite(3_000, 1280, 720)).toBeNull();
    expect(planSprite(60_000, 0, 720)).toBeNull();
  });
});

describe('buildSpriteArgs', () => {
  it('samples, scales and tiles into one image', () => {
    const plan = planSprite(50_000, 1280, 720);
    if (!plan) {
      throw new Error('expected a plan');
    }
    const args = buildSpriteArgs({
      sourcePath: '/s.mp4',
      outputPath: '/o/sprite.jpg',
      videoStreamIndex: 0,
      plan,
    });

    expect(args[args.indexOf('-vf') + 1]).toBe('fps=1/2,scale=160:90,tile=10x3');
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
  });
});

describe('buildSpriteVtt', () => {
  it('maps each time range to its place on the sheet', () => {
    const plan = planSprite(50_000, 1280, 720);
    if (!plan) {
      throw new Error('expected a plan');
    }
    const vtt = buildSpriteVtt(plan, 50_000, 'sprite.jpg');
    const lines = vtt.split('\n');

    expect(lines[0]).toBe('WEBVTT');
    expect(lines[2]).toBe('00:00:00.000 --> 00:00:02.000');
    expect(lines[3]).toBe('sprite.jpg#xywh=0,0,160,90');
    // The eleventh picture starts the second row.
    expect(vtt).toContain('00:00:20.000 --> 00:00:22.000\nsprite.jpg#xywh=0,90,160,90');
    // The last range runs to the end of the video.
    expect(vtt).toContain('00:00:48.000 --> 00:00:50.000\nsprite.jpg#xywh=640,180,160,90');
  });

  it('formats times beyond an hour', () => {
    const plan = planSprite(2 * 60 * 60 * 1000, 1920, 1080);
    if (!plan) {
      throw new Error('expected a plan');
    }

    expect(buildSpriteVtt(plan, 2 * 60 * 60 * 1000, 's.jpg')).toContain(
      '01:00:00.000 --> 01:01:12.000',
    );
  });
});
