// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import Hls from 'hls.js';
import { ExternalLink, Loader2, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  countEvent,
  fillErrorCode,
  fireAll,
  quartilesCrossed,
  type ResolvedAd,
  skipState,
} from '@/lib/ads';
import { formatClock } from '@/lib/format';
import type { ActiveBreak } from './use-ads';

/** An ad that has not started after this long is given up, in milliseconds. */
const START_TIMEOUT_MS = 8000;

/** The VAST code of "the file could not be played" and of "it took too long". */
const ERROR_NOT_PLAYABLE = 405;
const ERROR_TIMEOUT = 402;

interface AdLayerProps {
  active: ActiveBreak;
  /** What the viewer set the volume to: the ad plays as loud. */
  audio: { volume: number; muted: boolean };
  /** The ad is over, or was given up. */
  onClose: () => void;
}

/**
 * The screen of an ad, over the whole player. While it is up, nothing of the
 * film can be reached. It tells the ad server and our own server what
 * happens, plays the ad, and lets the viewer skip when the ad allows it.
 */
export function AdLayer({ active, audio, onClose }: AdLayerProps) {
  if (!active.ad) {
    return (
      <div
        className="absolute inset-0 z-50 grid place-items-center bg-onyx"
        role="status"
        aria-label="Loading an advertisement"
      >
        <Loader2 className="size-10 animate-spin text-vein" aria-hidden />
      </div>
    );
  }
  return (
    <PlayingAd
      key={active.item.id}
      sourceId={active.item.sourceId}
      ad={active.ad}
      audio={audio}
      onClose={onClose}
    />
  );
}

function PlayingAd({
  sourceId,
  ad,
  audio,
  onClose,
}: {
  sourceId: string;
  ad: ResolvedAd;
  audio: AdLayerProps['audio'];
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(ad.durationMs ?? 0);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(audio.muted);
  const closing = useRef(false);

  useEffect(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    let previous = 0;
    let impressed = false;
    const finish = () => {
      if (closing.current) {
        return;
      }
      closing.current = true;
      onClose();
    };
    const fail = (code: number) => {
      fireAll(ad.errors.map((url) => fillErrorCode(url, code)));
      countEvent(sourceId, 'ERROR');
      finish();
    };

    element.volume = audio.volume;
    element.muted = audio.muted;
    let hls: Hls | null = null;
    if (/mpegurl/i.test(ad.mimeType) && Hls.isSupported()) {
      hls = new Hls({ capLevelToPlayerSize: true });
      hls.loadSource(ad.mediaUrl);
      hls.attachMedia(element);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          fail(ERROR_NOT_PLAYABLE);
        }
      });
    } else {
      element.src = ad.mediaUrl;
    }

    const timeout = window.setTimeout(() => {
      if (!impressed) {
        fail(ERROR_TIMEOUT);
      }
    }, START_TIMEOUT_MS);

    const onPlaying = () => {
      setStarted(true);
      if (impressed) {
        return;
      }
      impressed = true;
      window.clearTimeout(timeout);
      fireAll(ad.impressions);
      fireAll(ad.tracking.start);
      countEvent(sourceId, 'IMPRESSION');
    };
    const onTime = () => {
      const now = element.currentTime * 1000;
      const total =
        ad.durationMs ?? (Number.isFinite(element.duration) ? element.duration * 1000 : 0);
      setElapsedMs(now);
      setDurationMs(total);
      for (const crossed of quartilesCrossed(previous, now, total)) {
        fireAll(ad.tracking[crossed.tracked]);
        countEvent(sourceId, crossed.counted);
      }
      previous = now;
    };
    const onEnded = () => {
      fireAll(ad.tracking.complete);
      countEvent(sourceId, 'COMPLETE');
      finish();
    };
    const onError = () => fail(ERROR_NOT_PLAYABLE);

    element.addEventListener('playing', onPlaying);
    element.addEventListener('timeupdate', onTime);
    element.addEventListener('ended', onEnded);
    element.addEventListener('error', onError);
    let cancelled = false;
    element.play().catch(() => {
      if (cancelled) {
        return;
      }
      // Browsers refuse sound without a click. The ad plays without it.
      element.muted = true;
      setMuted(true);
      element.play().catch(() => {
        if (!cancelled) {
          fail(ERROR_NOT_PLAYABLE);
        }
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      element.removeEventListener('playing', onPlaying);
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('error', onError);
      hls?.destroy();
      element.removeAttribute('src');
      element.load();
    };
  }, [ad, audio.muted, audio.volume, onClose, sourceId]);

  const skip = skipState(ad.skipOffsetMs, elapsedMs);
  const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));

  const visit = () => {
    if (!ad.clickThrough) {
      return;
    }
    window.open(ad.clickThrough, '_blank', 'noopener,noreferrer');
    fireAll(ad.clickTracking);
    countEvent(sourceId, 'CLICK');
    const element = video.current;
    element?.pause();
    // The ad goes on when the viewer comes back to this page.
    window.addEventListener('focus', () => void element?.play().catch(() => undefined), {
      once: true,
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-onyx" role="region" aria-label="Advertisement">
      <video ref={video} playsInline muted={muted} className="size-full object-contain" />

      {started ? null : (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="size-10 animate-spin text-vein" aria-hidden />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-linear-to-b from-onyx/80 to-transparent px-[clamp(0.75rem,3vw,2.5rem)] pt-[max(0.75rem,env(safe-area-inset-top))] pb-10">
        <span className="rounded-sm bg-vein px-2 py-0.5 text-xs font-semibold tracking-wide text-onyx">
          Ad
        </span>
        {durationMs > 0 ? (
          <span className="text-sm text-vein tabular-nums" aria-live="off">
            {formatClock(remaining)}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-onyx/80 to-transparent px-[clamp(0.75rem,3vw,2.5rem)] pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {ad.clickThrough ? (
            <button
              type="button"
              className="button border border-vein/70 bg-onyx/75 text-vein backdrop-blur-sm hover:bg-vein hover:text-onyx"
              onClick={visit}
            >
              <ExternalLink aria-hidden />
              Visit advertiser
            </button>
          ) : null}
          <button
            type="button"
            className="button border border-vein/70 bg-onyx/75 text-vein backdrop-blur-sm hover:bg-vein hover:text-onyx"
            aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          </button>
        </div>

        {ad.skipOffsetMs === null ? null : skip.skippable ? (
          <button
            type="button"
            className="button border border-vein/70 bg-onyx/75 text-vein backdrop-blur-sm hover:bg-vein hover:text-onyx"
            onClick={() => {
              fireAll(ad.tracking.skip);
              countEvent(sourceId, 'SKIP');
              closing.current = true;
              onClose();
            }}
          >
            <SkipForward className="fill-current" aria-hidden />
            Skip ad
          </button>
        ) : (
          <span className="rounded-sm bg-onyx/75 px-3 py-2 text-sm text-vein/80 tabular-nums">
            You can skip in {skip.secondsLeft}
          </span>
        )}
      </div>

      {durationMs > 0 ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-vein/20" aria-hidden>
          <div
            className="h-full bg-vein"
            style={{ width: `${Math.min(100, (elapsedMs / durationMs) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
