// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type Hls from 'hls.js';
import { X } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import { describeSharing, type SharingFigures } from '@/lib/p2p';
import {
  bufferAhead,
  droppedShare,
  EMPTY_READING,
  formatRate,
  hostOf,
  type StatsReading,
} from '@/lib/playback-stats';

/** How often the figures are read again. Often enough to watch, cheap enough to leave open. */
const EVERY_MS = 1000;

type QualityVideo = HTMLVideoElement & {
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
};

/**
 * Reads what is going on with the playback, once a second while the panel is
 * open. Nothing is read while it is closed.
 */
export function usePlaybackStats(
  video: RefObject<HTMLVideoElement | null>,
  hls: RefObject<Hls | null>,
  open: boolean,
  live: boolean,
): StatsReading {
  const [reading, setReading] = useState<StatsReading>(EMPTY_READING);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const read = () => {
      const element = video.current as QualityVideo | null;
      if (!element) {
        return;
      }
      const player = hls.current;
      const level = player ? player.levels[player.currentLevel] : undefined;
      const quality = element.getVideoPlaybackQuality?.();
      const seekableEnd =
        element.seekable.length > 0 ? element.seekable.end(element.seekable.length - 1) : null;
      setReading({
        resolution:
          level && level.width > 0
            ? `${level.width}×${level.height}`
            : element.videoWidth > 0
              ? `${element.videoWidth}×${element.videoHeight}`
              : null,
        bitrate: level?.bitrate ?? null,
        estimate: player?.bandwidthEstimate ?? null,
        ahead: bufferAhead(element.buffered, element.currentTime),
        dropped: quality?.droppedVideoFrames ?? 0,
        frames: quality?.totalVideoFrames ?? 0,
        behind:
          live && seekableEnd !== null ? Math.max(0, seekableEnd - element.currentTime) : null,
        level:
          player && player.currentLevel >= 0
            ? { index: player.currentLevel, count: player.levels.length }
            : null,
        host: hostOf(level?.url?.[0] ?? player?.url ?? element.currentSrc),
        codecs: level
          ? [level.videoCodec, level.audioCodec].filter(Boolean).join(', ') || null
          : null,
      });
    };
    read();
    const timer = window.setInterval(read, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [video, hls, open, live]);

  return reading;
}

interface StatsPanelProps {
  reading: StatsReading;
  sharing: { on: boolean; figures: SharingFigures } | null;
  onClose: () => void;
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-smoke">{name}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The figures behind the picture, for someone working out why a playback
 * misbehaves. Deliberately plain: a list of names and numbers, over the
 * picture, out of the way of the controls.
 */
export function StatsPanel({ reading, sharing, onClose }: StatsPanelProps) {
  return (
    <aside
      aria-label="Playback figures"
      data-own-keys
      className="absolute top-16 left-[clamp(0.75rem,2.5vw,2rem)] z-20 w-72 max-w-[calc(100vw-2rem)] border border-line bg-coal/92 p-4 text-xs backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-[0.18em] text-sard uppercase">Playback</h2>
        <button
          type="button"
          aria-label="Close the figures"
          className="-mr-1 flex size-6 items-center justify-center text-smoke hover:text-vein"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <dl className="grid gap-1.5">
        <Row name="Picture">{reading.resolution ?? '—'}</Row>
        <Row name="Rung">
          {reading.level ? `${reading.level.index + 1} of ${reading.level.count}` : '—'}
        </Row>
        <Row name="Of the video">{formatRate(reading.bitrate)}</Row>
        <Row name="Of the line">{formatRate(reading.estimate)}</Row>
        <Row name="Loaded ahead">{`${reading.ahead.toFixed(1)} s`}</Row>
        {reading.behind !== null ? (
          <Row name="Behind live">{`${reading.behind.toFixed(1)} s`}</Row>
        ) : null}
        <Row name="Frames lost">{droppedShare(reading)}</Row>
        <Row name="Server">
          <span className="max-w-40 truncate text-right">{reading.host ?? '—'}</span>
        </Row>
        {reading.codecs ? (
          <Row name="Codecs">
            <span className="max-w-40 truncate text-right">{reading.codecs}</span>
          </Row>
        ) : null}
      </dl>
      {sharing ? (
        <p className="mt-3 border-t border-line pt-3 leading-snug text-smoke">
          {describeSharing(sharing.figures, sharing.on)}
        </p>
      ) : null}
    </aside>
  );
}
