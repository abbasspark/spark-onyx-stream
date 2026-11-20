// SPDX-License-Identifier: AGPL-3.0-only
import { createSseParser, type ServerSentEvent } from './sse';

function collect() {
  const events: ServerSentEvent[] = [];
  const comments: string[] = [];
  const feed = createSseParser(
    (event) => events.push(event),
    (comment) => comments.push(comment),
  );
  return { events, comments, feed };
}

describe('createSseParser', () => {
  it('reads complete events', () => {
    const { events, feed } = collect();

    feed('event: job\ndata: {"jobId":"1"}\n\nevent: asset\ndata: {"assetId":"2"}\n\n');

    expect(events).toEqual([
      { event: 'job', data: '{"jobId":"1"}' },
      { event: 'asset', data: '{"assetId":"2"}' },
    ]);
  });

  it('puts together events that arrive in pieces', () => {
    const { events, feed } = collect();

    for (const piece of ['eve', 'nt: jo', 'b\nda', 'ta: {"a"', ':1}\n', '\n']) {
      feed(piece);
    }

    expect(events).toEqual([{ event: 'job', data: '{"a":1}' }]);
  });

  it('waits for the empty line before reporting an event', () => {
    const { events, feed } = collect();

    feed('event: job\ndata: 1\n');
    expect(events).toEqual([]);
    feed('\n');
    expect(events).toHaveLength(1);
  });

  it('reports comments and does not treat them as events', () => {
    const { events, comments, feed } = collect();

    feed('retry: 3000\n: connected\n\n: keep-alive\n\n');

    expect(events).toEqual([]);
    expect(comments).toEqual(['connected', 'keep-alive']);
  });

  it('uses the default name and joins several data lines', () => {
    const { events, feed } = collect();

    feed('data: first\ndata: second\n\n');

    expect(events).toEqual([{ event: 'message', data: 'first\nsecond' }]);
  });

  it('accepts Windows line breaks, also when a pair is split', () => {
    const { events, feed } = collect();

    feed('event: job\r\ndata: 1\r');
    feed('\n\r\n');

    expect(events).toEqual([{ event: 'job', data: '1' }]);
  });

  it('resets the event name after each event', () => {
    const { events, feed } = collect();

    feed('event: job\ndata: 1\n\ndata: 2\n\n');

    expect(events.map((event) => event.event)).toEqual(['job', 'message']);
  });
});
