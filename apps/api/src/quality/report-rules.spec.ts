// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  applyReport,
  cleanMessage,
  type ReportInput,
  serverOf,
  type SessionState,
} from './report-rules.js';

const startedAt = new Date('2026-12-01T20:00:00Z');
const after = (seconds: number) => new Date(startedAt.getTime() + seconds * 1000);

function session(over: Partial<SessionState> = {}): SessionState {
  return {
    startedAt,
    startupMs: null,
    playedSeconds: 0,
    stallCount: 0,
    stallMs: 0,
    qualityChanges: 0,
    bitrateKbps: null,
    height: null,
    droppedFrames: 0,
    recoveredErrors: 0,
    errorCode: null,
    errorMessage: null,
    errorAtSeconds: null,
    ended: false,
    player: null,
    playerVersion: null,
    ...over,
  };
}

const report = (over: Partial<ReportInput> = {}): ReportInput => ({
  played: 0,
  stalls: 0,
  stallMs: 0,
  qualityChanges: 0,
  ...over,
});

describe('applyReport', () => {
  it('takes what a player counted so far', () => {
    const next = applyReport(
      session(),
      report({
        startupMs: 1240.4,
        played: 58.6,
        stalls: 2,
        stallMs: 3100,
        qualityChanges: 3,
        bitrateKbps: 4200,
        height: 1080,
        droppedFrames: 12,
        recoveredErrors: 1,
        player: { name: 'web', version: '1.4.0' },
      }),
      after(65),
    );
    expect(next).toEqual({
      startupMs: 1240,
      playedSeconds: 59,
      stallCount: 2,
      stallMs: 3100,
      qualityChanges: 3,
      bitrateKbps: 4200,
      height: 1080,
      droppedFrames: 12,
      recoveredErrors: 1,
      errorCode: null,
      errorMessage: null,
      errorAtSeconds: null,
      ended: false,
      player: 'web',
      playerVersion: '1.4.0',
    });
  });

  it('only lets figures grow: a late or repeated report changes nothing', () => {
    const before = session({ startupMs: 900, playedSeconds: 120, stallCount: 3, stallMs: 5000 });
    const next = applyReport(before, report({ played: 60, stalls: 1, stallMs: 900 }), after(200));
    expect(next).toMatchObject({ playedSeconds: 120, stallCount: 3, stallMs: 5000 });
  });

  it('believes nothing that lasted longer than the time that passed', () => {
    const next = applyReport(
      session(),
      report({ startupMs: 800, played: 9000, stallMs: 9_000_000, stalls: 4 }),
      after(60),
    );
    // A minute passed, and ten seconds are given for clocks and the way here.
    expect(next.playedSeconds).toBe(70);
    expect(next.stallMs).toBe(70_000);
  });

  it('keeps the first time to start, and none that cannot be', () => {
    expect(
      applyReport(session({ startupMs: 700 }), report({ startupMs: 90 }), after(5)),
    ).toMatchObject({ startupMs: 700 });
    // Longer than the playback exists.
    expect(applyReport(session(), report({ startupMs: 60_000 }), after(5)).startupMs).toBeNull();
    // Longer than any player waits.
    expect(applyReport(session(), report({ startupMs: 400_000 }), after(900)).startupMs).toBeNull();
  });

  it('counts no playing and no stalls for what never started', () => {
    const next = applyReport(
      session(),
      report({ played: 30, stalls: 2, stallMs: 4000, error: { code: 'network' } }),
      after(40),
    );
    expect(next).toMatchObject({ startupMs: null, playedSeconds: 0, stallCount: 0, stallMs: 0 });
    expect(next.errorCode).toBe('network');
  });

  it('keeps the problem that ended playback as first said', () => {
    const failed = applyReport(
      session({ startupMs: 500 }),
      report({
        played: 12,
        error: { code: 'media', message: ' decode  failed\nat frame 3 ', position: 12.4 },
      }),
      after(20),
    );
    expect(failed).toMatchObject({
      errorCode: 'media',
      errorMessage: 'decode failed at frame 3',
      errorAtSeconds: 12,
    });
    const again = applyReport(
      { ...failed, startedAt },
      report({ played: 12, error: { code: 'network', message: 'something else' } }),
      after(25),
    );
    expect(again).toMatchObject({ errorCode: 'media', errorMessage: 'decode failed at frame 3' });
  });

  it('drops a code that is not a short word', () => {
    const next = applyReport(session(), report({ error: { code: 'Not A Code!' } }), after(5));
    expect(next.errorCode).toBeNull();
  });

  it('stays ended, and keeps who the player first said it is', () => {
    const done = applyReport(
      session({ startupMs: 300, player: 'web', playerVersion: '1' }),
      report({ ended: true, player: { name: 'other', version: '9' } }),
      after(30),
    );
    expect(done).toMatchObject({ ended: true, player: 'web', playerVersion: '1' });
    expect(applyReport({ ...done, startedAt }, report(), after(40)).ended).toBe(true);
  });
});

describe('cleanMessage', () => {
  it('cuts addresses down to their host, so that no signed address is kept', () => {
    expect(
      cleanMessage(
        'fragLoadError https://edge1.example.com/v1/media/0190/eyJhbGciOi.sig/hls/720p/seg_4.m4s?x=1 (404)',
      ),
    ).toBe('fragLoadError https://edge1.example.com/… (404)');
  });

  it('cuts a long message and has nothing for an empty one', () => {
    expect(cleanMessage('x'.repeat(500))).toHaveLength(300);
    expect(cleanMessage('   ')).toBeNull();
    expect(cleanMessage(undefined)).toBeNull();
  });
});

describe('serverOf', () => {
  it('names the main server "origin" and an edge by its host', () => {
    const base = 'https://media.example.com';
    expect(serverOf('/v1/media/a/b/master.m3u8', base)).toBe('origin');
    expect(serverOf('https://media.example.com/v1/media/a/b/master.m3u8', base)).toBe('origin');
    expect(serverOf('https://Edge-Fra.example.com:8443/v1/media/a/b/master.m3u8', base)).toBe(
      'edge-fra.example.com:8443',
    );
    expect(serverOf('/v1/live/a/b/index.m3u8', '')).toBe('origin');
  });
});
