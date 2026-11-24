// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { type RefObject, useEffect, useRef } from 'react';
import { type ErrorCode, QualityMeter, sendQualityReport } from '@/lib/quality';

/** How often it is looked whether a report is due. */
const CHECK_EVERY_MS = 5000;
/** A player that lived shorter than this was never really there: React sets one up twice while developing. */
const SETTLE_MS = 500;

/** The problem a streaming library reports, as the short word the server keeps. */
export function errorCodeOf(error: {
  type?: string;
  details?: string;
  response?: { code?: number };
}): ErrorCode {
  const status = error.response?.code;
  if (status === 401 || status === 403 || status === 410) {
    return 'expired';
  }
  if (error.type === 'keySystemError' || /key/i.test(error.details ?? '')) {
    return 'key';
  }
  if (error.type === 'networkError') {
    return /timeout/i.test(error.details ?? '') ? 'timeout' : 'network';
  }
  if (error.type === 'mediaError') {
    return 'media';
  }
  return 'other';
}

/** What a streaming library says about a problem, without any address. */
export function errorWordsOf(error: { details?: string; response?: { code?: number } }): string {
  return [error.details ?? 'error', error.response?.code ? `(${error.response.code})` : '']
    .filter(Boolean)
    .join(' ');
}

/**
 * Counts how the playback in a video element goes and reports it, for as
 * long as `qualityId` stays the same. The meter is handed back for what the
 * element does not tell: changes of quality and problems of the streaming
 * library. With no `qualityId` nothing is counted and nothing is sent.
 */
export function useQualityReports(
  qualityId: string | null | undefined,
  video: RefObject<HTMLVideoElement | null>,
): RefObject<QualityMeter | null> {
  const meter = useRef<QualityMeter | null>(null);

  useEffect(() => {
    const element = video.current;
    if (!qualityId || !element) {
      meter.current = null;
      return;
    }
    const current = new QualityMeter();
    meter.current = current;
    const createdAt = performance.now();

    const send = () => {
      current.droppedFrames(element.getVideoPlaybackQuality?.().droppedVideoFrames);
      sendQualityReport(qualityId, current.take());
    };
    const sendIfDue = () => {
      if (current.due) {
        send();
      }
    };
    const handlers: [string, () => void][] = [
      ['play', () => current.play()],
      ['pause', () => current.pause()],
      ['playing', () => (current.playing(), sendIfDue())],
      ['waiting', () => current.waiting()],
      ['seeking', () => current.seeking()],
      ['timeupdate', () => current.tick(element.currentTime)],
      ['ended', () => (current.end(), send())],
    ];
    for (const [name, handler] of handlers) {
      element.addEventListener(name, handler);
    }
    const timer = window.setInterval(sendIfDue, CHECK_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        send();
      }
    };
    window.addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      for (const [name, handler] of handlers) {
        element.removeEventListener(name, handler);
      }
      window.clearInterval(timer);
      window.removeEventListener('pagehide', send);
      document.removeEventListener('visibilitychange', onHide);
      // Leaving the video is its end, whatever came before. A player that
      // was taken down the moment it was set up has nothing to say.
      if (current.hasStarted || performance.now() - createdAt > SETTLE_MS) {
        current.end();
        send();
      }
      meter.current = null;
    };
  }, [qualityId, video]);

  return meter;
}
