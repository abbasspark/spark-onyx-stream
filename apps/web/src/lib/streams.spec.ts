// SPDX-License-Identifier: AGPL-3.0-only
import {
  describePlaying,
  describeStreamDevice,
  devicesPhrase,
  holdStream,
  readStreamLimit,
} from './streams';

describe('describing a stream', () => {
  it('names the kind of device and what it said it is', () => {
    expect(
      describeStreamDevice({
        device: 'MOBILE',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      }),
    ).toMatch(/^Phone, .*iPhone|^Phone, .*iOS/);
    expect(describeStreamDevice({ device: 'TV', userAgent: null })).toBe('TV');
  });

  it('says what is playing', () => {
    expect(describePlaying({ kind: 'VIDEO', subject: 'Night Train' })).toBe('Playing Night Train');
    expect(describePlaying({ kind: 'LIVE', subject: 'News 24' })).toBe('Watching News 24');
    expect(devicesPhrase(1)).toBe('on 1 device');
    expect(devicesPhrase(2)).toBe('on 2 devices');
  });
});

describe('readStreamLimit', () => {
  it('reads the refusal of a full account', () => {
    const streams = [{ id: 's1', kind: 'VIDEO', subject: 'Night Train' }];
    expect(readStreamLimit(409, { code: 'stream_limit', limit: 2, streams })).toEqual({
      limit: 2,
      streams,
    });
  });

  it('leaves other refusals alone', () => {
    expect(readStreamLimit(409, { code: 'off_air' })).toBeNull();
    expect(readStreamLimit(409, null)).toBeNull();
    expect(readStreamLimit(402, { code: 'stream_limit' })).toBeNull();
  });
});

describe('holdStream', () => {
  const ticket = { id: 's1', beatSeconds: 30 };
  function setup(answers: ('playing' | 'stopped')[]) {
    let tick: () => void = () => undefined;
    const calls: string[] = [];
    const stopped = vi.fn();
    const returned = vi.fn();
    const life = { leave: () => undefined as void, comeBack: () => undefined as void };
    const release = holdStream(
      ticket,
      { onStopped: stopped, onReturned: returned },
      {
        beat: async (id) => {
          calls.push(`beat ${id}`);
          return answers.shift() ?? 'playing';
        },
        end: (id) => void calls.push(`end ${id}`),
      },
      {
        setInterval: (run, ms) => {
          calls.push(`every ${ms}`);
          tick = run;
          return 1;
        },
        clearInterval: () => void calls.push('cleared'),
      },
      {
        listen: (onLeave, onReturn) => {
          life.leave = onLeave;
          life.comeBack = onReturn;
          return () => void calls.push('unlistened');
        },
      },
    );
    return { tick: () => tick(), calls, stopped, returned, release, life };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('reports on time and gives the place back on leaving', async () => {
    const { tick, calls, stopped, release } = setup([]);
    tick();
    tick();
    await settle();
    release();
    expect(calls).toEqual(['every 30000', 'beat s1', 'beat s1', 'unlistened', 'cleared', 'end s1']);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('tells the player when the place was taken away, once, and gives nothing back', async () => {
    const { tick, calls, stopped, release } = setup(['playing', 'stopped']);
    tick();
    await settle();
    tick();
    await settle();
    tick();
    await settle();
    release();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call.startsWith('end'))).toEqual([]);
    expect(calls.filter((call) => call.startsWith('beat'))).toHaveLength(2);
  });

  it('gives the place back when the page is left, and asks again when the browser brings it back', async () => {
    const { tick, calls, returned, release, life } = setup([]);
    // Coming back without having left is nothing.
    life.comeBack();
    expect(returned).not.toHaveBeenCalled();

    life.leave();
    life.leave();
    expect(calls.filter((call) => call.startsWith('end'))).toEqual(['end s1']);
    tick();
    await settle();
    expect(calls.filter((call) => call.startsWith('beat'))).toEqual([]);

    life.comeBack();
    expect(returned).toHaveBeenCalledTimes(1);
    release();
    expect(calls.filter((call) => call.startsWith('end'))).toEqual(['end s1']);
  });

  it('does not stop a player that left while a report was on its way', async () => {
    const { tick, stopped, release } = setup(['stopped']);
    tick();
    release();
    await settle();
    expect(stopped).not.toHaveBeenCalled();
  });
});
