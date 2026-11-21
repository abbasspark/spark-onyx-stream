// SPDX-License-Identifier: AGPL-3.0-only
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/api/client';
import { Spinner } from './ui/display';

/** Wait before a broken live stream is opened again. */
const RETRY_MS = 3000;

interface LivePlayerProps {
  /** Signed address of the channel's playlist. */
  url: string;
  title: string;
  className?: string;
}

/**
 * Plays a running channel. A live stream can go away and come back, so this
 * player keeps trying instead of ending with an error.
 */
export function LivePlayer({ url, title, className }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'waiting' | 'unsupported'>('loading');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }
    const source = apiUrl(url);
    setState('loading');

    const onPlaying = () => setState('playing');
    video.addEventListener('playing', onPlaying);
    let retry: number | undefined;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      const open = () => {
        hls = new Hls({ liveSyncDurationCount: 3, lowLatencyMode: false });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            return;
          }
          // The channel is starting, reconnecting or was stopped. Start over in a moment.
          setState('waiting');
          hls?.destroy();
          hls = null;
          retry = window.setTimeout(open, RETRY_MS);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => undefined);
        });
        hls.loadSource(source);
        hls.attachMedia(video);
      };
      open();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      void video.play().catch(() => undefined);
    } else {
      setState('unsupported');
    }

    return () => {
      window.clearTimeout(retry);
      video.removeEventListener('playing', onPlaying);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  return (
    // The outer box keeps its height in a scrolling column: a clipped box alone could be squeezed.
    <div className={className}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black" data-state={state}>
        {/* Muted, so the browser lets it start by itself. The controls turn the sound on. */}
        <video
          ref={videoRef}
          className="size-full"
          controls
          muted
          autoPlay
          playsInline
          aria-label={`Live picture of ${title}`}
        />
        {state === 'playing' ? (
          <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            Live
          </span>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-sm text-white/80">
            {state === 'unsupported' ? (
              'This browser cannot play HLS video'
            ) : (
              <>
                <Spinner label="Loading the stream" className="text-white/80" />
                {state === 'waiting' ? 'Waiting for the stream' : 'Loading the stream'}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
