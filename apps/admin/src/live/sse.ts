// SPDX-License-Identifier: AGPL-3.0-only

export interface ServerSentEvent {
  /** The event name. "message" when the server sent none. */
  event: string;
  data: string;
}

/**
 * Makes a reader for a stream of server-sent events. Text is fed in as it
 * arrives, in pieces of any size, and each complete event is handed to the
 * callback. Comment lines, which servers send to keep a connection open, are
 * reported through `onComment`.
 */
export function createSseParser(
  onEvent: (event: ServerSentEvent) => void,
  onComment?: (comment: string) => void,
): (chunk: string) => void {
  let buffer = '';
  let event = 'message';
  let data: string[] = [];

  const dispatch = () => {
    if (data.length > 0) {
      onEvent({ event, data: data.join('\n') });
    }
    event = 'message';
    data = [];
  };

  return (chunk) => {
    buffer += chunk;
    let end: number;
    // A line is complete once its line break has arrived.
    while ((end = buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = buffer.slice(0, end);
      // A lone carriage return at the very end may be the first half of a pair still on its way.
      if (buffer[end] === '\r' && end === buffer.length - 1) {
        break;
      }
      buffer = buffer.slice(end + (buffer.startsWith('\r\n', end) ? 2 : 1));

      if (line === '') {
        dispatch();
      } else if (line.startsWith(':')) {
        onComment?.(line.slice(1).trim());
      } else {
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') {
          event = value;
        } else if (field === 'data') {
          data.push(value);
        }
      }
    }
  };
}
