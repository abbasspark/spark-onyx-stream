// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  type AdBreak,
  type AdPlan,
  countEvent,
  pendingBreak,
  reachedBreak,
  type ResolvedAd,
  resolveAd,
} from '@/lib/ads';

/** The break that is on the screen, with its ad once that has come in. */
export interface ActiveBreak {
  item: AdBreak;
  /** Null while the ad is asked for. */
  ad: ResolvedAd | null;
}

export interface AdsControl {
  /** The break on the screen, or null while the video plays. */
  active: ActiveBreak | null;
  /**
   * Called when the video is ready to start. True when a break comes first:
   * `resume` is then called by the break, once it is over.
   */
  beforeStart: (resume: () => void) => boolean;
  /**
   * Called when the video has ended. True when a break comes last: `done` is
   * then called by the break, once it is over.
   */
  beforeEnd: (done: () => void) => boolean;
  /** Ends the break on the screen. The film goes on. */
  close: () => void;
}

/**
 * The ads of one video: a break before it, breaks in the middle, a break
 * after it. A break stops the video, asks its source for an ad, shows it, and
 * then lets the video go on from where it was.
 */
export function useAds(
  plan: AdPlan | null | undefined,
  video: RefObject<HTMLVideoElement | null>,
): AdsControl {
  const [active, setActive] = useState<ActiveBreak | null>(null);
  const activeRef = useRef<ActiveBreak | null>(null);
  const played = useRef(new Set<string>());
  const then = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new video has its own breaks.
  useEffect(() => {
    played.current = new Set();
    activeRef.current = null;
    then.current = null;
    setActive(null);
  }, [plan]);

  const show = useCallback((next: ActiveBreak | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const close = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    show(null);
    const resume = then.current;
    then.current = null;
    resume?.();
  }, [show]);

  const run = useCallback(
    async (item: AdBreak, resume: () => void) => {
      played.current.add(item.id);
      then.current = resume;
      show({ item, ad: null });
      const ad = await resolveAd(item.sourceId);
      if (!alive.current || activeRef.current?.item.id !== item.id) {
        return;
      }
      if (!ad) {
        // The ad server had nothing for this viewer. The film goes on.
        countEvent(item.sourceId, 'ERROR');
        close();
        return;
      }
      show({ item, ad });
    },
    [close, show],
  );

  const beforeStart = useCallback(
    (resume: () => void) => {
      const item = pendingBreak(planRef.current, 'PRE', played.current);
      if (!item) {
        return false;
      }
      void run(item, resume);
      return true;
    },
    [run],
  );

  const beforeEnd = useCallback(
    (done: () => void) => {
      const item = pendingBreak(planRef.current, 'POST', played.current);
      if (!item) {
        return false;
      }
      void run(item, done);
      return true;
    },
    [run],
  );

  // Breaks in the middle: the moment playing reaches one.
  useEffect(() => {
    const element = video.current;
    if (!element || !plan?.breaks.some((item) => item.position === 'MID')) {
      return;
    }
    let previous = element.currentTime;
    const onTime = () => {
      const now = element.currentTime;
      const item = activeRef.current
        ? null
        : reachedBreak(planRef.current, played.current, previous, now);
      previous = now;
      if (item) {
        element.pause();
        void run(item, () => void element.play().catch(() => undefined));
      }
    };
    const onSeek = () => {
      previous = element.currentTime;
    };
    element.addEventListener('timeupdate', onTime);
    element.addEventListener('seeked', onSeek);
    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('seeked', onSeek);
    };
  }, [plan, video, run]);

  return { active, beforeStart, beforeEnd, close };
}
