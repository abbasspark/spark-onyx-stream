// SPDX-License-Identifier: AGPL-3.0-only
import type { Channel, ChannelStatus, ChannelStreams, SourceProbe } from '@/api/types';
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
    (channel.status === 'WAITING' && channel.statusMessage !== null)
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
  const text = `${channel.number ?? ''} ${channel.name} ${channel.source}`.toLowerCase();
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

/** What happens to the audio of a tested source, in words. */
export function describeAudioPlan(probe: Extract<SourceProbe, { ok: true }>): string {
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
