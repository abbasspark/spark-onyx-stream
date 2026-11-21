// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Channel,
  ChannelStatus,
  ChannelStreams,
  EncoderSettings,
  SourceProbe,
} from '@/api/types';
import type { BadgeTone } from '@/components/ui/display';

export interface StatusLook {
  label: string;
  tone: BadgeTone;
  /** The dot of the badge pulses. */
  live: boolean;
}

const STATUS_LOOKS: Record<ChannelStatus, StatusLook> = {
  RUNNING: { label: 'On air', tone: 'success', live: true },
  STARTING: { label: 'Starting', tone: 'info', live: true },
  WAITING: { label: 'Waiting', tone: 'info', live: true },
  IDLE: { label: 'Waiting for encoder', tone: 'info', live: true },
  RECONNECTING: { label: 'Reconnecting', tone: 'warning', live: true },
  FAILED: { label: 'Failed', tone: 'danger', live: false },
  STOPPED: { label: 'Stopped', tone: 'neutral', live: false },
};

export function statusLook(status: ChannelStatus): StatusLook {
  return STATUS_LOOKS[status];
}

/** The groups the list can be narrowed to. */
export type ChannelFilter = 'all' | 'on-air' | 'attention' | 'stopped';

export function isChannelFilter(value: string | null): value is ChannelFilter {
  return value === 'all' || value === 'on-air' || value === 'attention' || value === 'stopped';
}

/** A channel that should run and does not. */
export function needsAttention(channel: Channel): boolean {
  return (
    channel.status === 'FAILED' ||
    channel.status === 'RECONNECTING' ||
    // Waiting is fine, unless something says why it cannot end.
    ((channel.status === 'WAITING' || channel.status === 'IDLE') && channel.statusMessage !== null)
  );
}

export function matchesFilter(channel: Channel, filter: ChannelFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'on-air':
      return channel.status === 'RUNNING';
    case 'attention':
      return needsAttention(channel);
    case 'stopped':
      return channel.status === 'STOPPED';
  }
}

/** Finds channels by name, number or source. */
export function matchesSearch(channel: Channel, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${channel.number ?? ''} ${channel.name} ${sourceText(channel)}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

export interface ChannelTotals {
  total: number;
  onAir: number;
  attention: number;
  stopped: number;
  /** Bits per second all running channels send out together. */
  bitrate: number;
}

export function totalsOf(channels: readonly Channel[]): ChannelTotals {
  return {
    total: channels.length,
    onAir: channels.filter((channel) => channel.status === 'RUNNING').length,
    attention: channels.filter(needsAttention).length,
    stopped: channels.filter((channel) => channel.status === 'STOPPED').length,
    bitrate: channels.reduce((sum, channel) => sum + (channel.health?.bitrate ?? 0), 0),
  };
}

const CODEC_NAMES: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  mpeg2video: 'MPEG-2',
  aac: 'AAC',
  mp2: 'MP2',
  mp3: 'MP3',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  opus: 'Opus',
};

export function codecName(codec: string): string {
  return CODEC_NAMES[codec] ?? codec.toUpperCase();
}

/** The usual short name of a picture size: "1080p", "4K". */
export function qualityName(height: number): string {
  if (height >= 2160) {
    return '4K';
  }
  return `${height}p`;
}

/** "1080p · 25 fps · H.264 · AAC stereo" */
export function describeStreams(streams: ChannelStreams): string {
  const parts = [qualityName(streams.height)];
  if (streams.frameRate) {
    parts.push(`${Number(streams.frameRate.toFixed(2))} fps`);
  }
  parts.push(codecName(streams.videoCodec));
  parts.push(describeAudio(streams));
  return parts.join(' · ');
}

export function describeAudio(streams: ChannelStreams): string {
  if (!streams.audioCodec) {
    return 'no audio';
  }
  const layout =
    streams.audioChannels === 1
      ? ' mono'
      : streams.audioChannels === 2
        ? ' stereo'
        : streams.audioChannels === 6
          ? ' 5.1'
          : '';
  return `${codecName(streams.audioCodec)}${layout}`;
}

/** Qualities a transcoded channel can be given, with their video bitrate in kbit/s. */
export const QUALITY_OPTIONS: readonly { height: number; videoKbps: number }[] = [
  { height: 1080, videoKbps: 5000 },
  { height: 720, videoKbps: 2800 },
  { height: 480, videoKbps: 1400 },
  { height: 360, videoKbps: 800 },
  { height: 240, videoKbps: 400 },
];
export const DEFAULT_QUALITIES: readonly number[] = [1080, 720, 480];

/** A chosen quality is left out when the source has fewer lines. */
export function exceedsSource(height: number, streams: ChannelStreams | null): boolean {
  return streams !== null && height > streams.height * 1.05;
}

/** Adds or removes a quality, keeping the best first. */
export function toggleQuality(qualities: readonly number[], height: number): number[] {
  const next = qualities.includes(height)
    ? qualities.filter((quality) => quality !== height)
    : [...qualities, height];
  return next.sort((a, b) => b - a);
}

/** "720p, 480p" for a transcoded channel: what it sends, or what was chosen while that is unknown. */
export function describeQualities(channel: Pick<Channel, 'qualities' | 'outputs'>): string {
  const names = channel.outputs
    ? channel.outputs.map((output) => output.name)
    : channel.qualities.map((height) => `${height}p`);
  return names.join(', ');
}

/** Encoding slower than the source arrives means viewers will see pauses. */
export function isFallingBehind(channel: Channel): boolean {
  const speed = channel.health?.speed;
  return (
    channel.mode === 'TRANSCODE' &&
    channel.status === 'RUNNING' &&
    speed !== null &&
    speed !== undefined &&
    speed < 0.95
  );
}

/** What happens to a tested source with the chosen processing, in words. */
export function describeProbePlan(
  probe: Extract<SourceProbe, { ok: true }>,
  mode: 'COPY' | 'TRANSCODE',
): string {
  if (mode === 'TRANSCODE') {
    return probe.streams.audioCodec
      ? 'Video and audio are encoded again, into the qualities you choose.'
      : 'The video is encoded again, into the qualities you choose. The source has no audio.';
  }
  if (probe.copyObstacle) {
    return `${probe.copyObstacle}.`;
  }
  if (probe.audio === 'none') {
    return 'The source has no audio. The channel will be silent.';
  }
  if (probe.audio === 'copy') {
    return 'Video and audio are passed on untouched.';
  }
  return `Video is passed on untouched. The ${codecName(probe.streams.audioCodec ?? '')} audio is converted to AAC, because browsers cannot play it.`;
}

/** The protocol of a source address in capitals: "HTTPS", "SRT". */
export function protocolOf(source: string): string {
  const match = /^([a-z]+):/i.exec(source);
  return match ? (match[1] as string).toUpperCase() : '';
}

/** How long a channel has been on air: "42 s", "12 min", "3 h 5 min", "2 d 4 h". */
export function formatUptime(startedAt: string | null, now: number = Date.now()): string {
  if (!startedAt) {
    return '–';
  }
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ${minutes % 60} min`;
  }
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** Reads the number field of the form. Undefined when the text is not a channel number. */
export function parseChannelNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return /^\d{1,4}$/.test(trimmed) && value >= 1 ? value : undefined;
}

/** Where a channel gets its video from, as a line of text. */
export function sourceText(channel: Pick<Channel, 'ingest' | 'source'>): string {
  return channel.ingest === 'PUSH' ? 'Pushed by an encoder' : channel.source;
}

/** The usual ports of the ingest server, used when no public address is configured. */
const RTMP_PORT = 1935;
const SRT_PORT = 8890;

export interface EncoderAddresses {
  /** "Server" in OBS. */
  rtmpServer: string;
  streamKey: string;
  /** One address for encoders that take SRT. It contains the stream key. */
  srtUrl: string;
}

/**
 * What to enter in an encoder. Addresses the server does not know are made
 * from the host name the panel itself is opened with, which is right for an
 * installation on one server.
 */
export function encoderAddresses(settings: EncoderSettings, hostname: string): EncoderAddresses {
  return {
    rtmpServer: settings.rtmpServer ?? `rtmp://${hostname}:${RTMP_PORT}/live`,
    streamKey: settings.streamKey,
    srtUrl:
      settings.srtUrl ??
      `srt://${hostname}:${SRT_PORT}?streamid=publish:live/${settings.streamKey}`,
  };
}
