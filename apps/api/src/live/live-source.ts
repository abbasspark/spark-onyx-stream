// SPDX-License-Identifier: AGPL-3.0-only

/** Protocols a channel can be pulled from, with the name shown to admins. */
export const SOURCE_PROTOCOLS = {
  'http:': 'HTTP',
  'https:': 'HTTPS',
  'rtmp:': 'RTMP',
  'rtmps:': 'RTMPS',
  'srt:': 'SRT',
  'rtsp:': 'RTSP',
  'rtsps:': 'RTSPS',
  'udp:': 'UDP',
  'rtp:': 'RTP',
} as const;

export type SourceProtocol = keyof typeof SOURCE_PROTOCOLS;

/**
 * Microseconds a network read may take before FFmpeg gives up on the connection.
 *
 * Longer than the fifteen seconds a source gets to answer when it is probed,
 * so a silent source is reported as silent and not with whatever FFmpeg says
 * when its own patience ends first.
 */
const READ_TIMEOUT_US = '20000000';

export class InvalidSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSourceError';
  }
}

export interface LiveSource {
  /** The full address, as given to FFmpeg. May carry a password or a stream key. */
  url: string;
  protocol: SourceProtocol;
  /** The address without anything secret, for lists, logs and messages. */
  label: string;
}

/**
 * Reads the address of a source.
 *
 * Only network protocols are accepted. A file path, "concat:", "pipe:" and
 * the like would let an admin read files of the server through a channel.
 *
 * @throws InvalidSourceError with a message for the admin.
 */
export function parseSource(value: string): LiveSource {
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) {
    throw new InvalidSourceError('The address must not contain spaces');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidSourceError('Enter a complete address, such as https://example.com/live.m3u8');
  }

  if (!(parsed.protocol in SOURCE_PROTOCOLS)) {
    throw new InvalidSourceError(
      `Sources must use one of: ${Object.values(SOURCE_PROTOCOLS).join(', ')}`,
    );
  }
  if (!parsed.hostname) {
    throw new InvalidSourceError('The address has no host');
  }

  const protocol = parsed.protocol as SourceProtocol;
  return { url: trimmed, protocol, label: labelOf(parsed, protocol) };
}

/**
 * The part of an address that is safe to show. User name, password and query
 * are dropped. So is the part of the path that usually is a stream key or an
 * account: the last part for RTMP, everything but the file name for HTTP.
 */
function labelOf(parsed: URL, protocol: SourceProtocol): string {
  const base = `${parsed.protocol}//${parsed.host}`;
  const parts = parsed.pathname.split('/').filter((part) => part.length > 0);

  if (protocol === 'http:' || protocol === 'https:') {
    const file = parts.at(-1);
    if (!file) {
      return base;
    }
    return parts.length > 1 ? `${base}/…/${file}` : `${base}/${file}`;
  }
  if (protocol === 'rtmp:' || protocol === 'rtmps:') {
    return parts.length > 1 ? `${base}/${parts[0]}/…` : base;
  }
  return base;
}

/**
 * FFmpeg options that belong in front of "-i" for a source.
 *
 * The protocol list stops a playlist on a web server from pointing FFmpeg at
 * local files or other protocols.
 */
export function inputOptions(source: LiveSource): string[] {
  switch (source.protocol) {
    case 'http:':
    case 'https:':
      return [
        '-protocol_whitelist',
        'http,https,tcp,tls,crypto',
        '-rw_timeout',
        READ_TIMEOUT_US,
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_on_network_error',
        '1',
        '-reconnect_delay_max',
        '5',
      ];
    case 'rtmp:':
    case 'rtmps:':
      return ['-protocol_whitelist', 'rtmp,rtmps,tcp,tls', '-rw_timeout', READ_TIMEOUT_US];
    case 'srt:':
      return ['-protocol_whitelist', 'srt,udp'];
    case 'rtsp:':
    case 'rtsps:':
      // Over TCP: cameras and servers behind a firewall rarely get UDP through.
      return [
        '-protocol_whitelist',
        'rtsp,rtsps,rtp,tcp,tls',
        '-rtsp_transport',
        'tcp',
        '-timeout',
        READ_TIMEOUT_US,
      ];
    case 'udp:':
      return ['-protocol_whitelist', 'udp', '-timeout', READ_TIMEOUT_US];
    case 'rtp:':
      return ['-protocol_whitelist', 'rtp,udp'];
  }
}
