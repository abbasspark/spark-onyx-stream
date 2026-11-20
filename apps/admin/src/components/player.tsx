// SPDX-License-Identifier: AGPL-3.0-only
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/api/client';
import type { Playback } from '@/api/types';
import { ErrorNote } from './ui/display';
import { Select } from './ui/form';

interface Quality {
  /** Index of the level in hls.js. -1 means automatic. */
  index: number;
  label: string;
}

/**
 * Plays an asset from its signed playback URLs. Uses hls.js where the browser
 * supports it and the browser's own HLS support otherwise (Safari on iOS).
 */
export function Player({ playback, title }: { playback: Playback; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [selected, setSelected] = useState(-1);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const source = apiUrl(playback.manifestUrl);
    setError(null);
    setQualities([]);
    setSelected(-1);
    setPlaying(null);

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setQualities(
          data.levels
            .map((level, index) => ({ index, label: `${level.height}p`, height: level.height }))
            .sort((a, b) => b.height - a.height),
        );
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels[data.level];
        setPlaying(level ? `${level.height}p` : null);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`Playback failed: ${data.details}`);
        }
      });
      hls.loadSource(source);
      hls.attachMedia(video);

      return () => {
        hlsRef.current = null;
        hls.destroy();
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    setError('This browser cannot play HLS video');
    return undefined;
  }, [playback.manifestUrl]);

  const chooseQuality = (index: number) => {
    setSelected(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  return (
    <div>
      <video
        ref={videoRef}
        controls
        playsInline
        poster={playback.posterUrl ? apiUrl(playback.posterUrl) : undefined}
        aria-label={`Preview of ${title}`}
        className="block aspect-video w-full bg-black"
      />
      {error ? <ErrorNote error={error} className="m-3" /> : null}
      {qualities.length > 0 ? (
        <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Quality</span>
            <Select
              aria-label="Quality"
              className="h-8 w-32"
              value={String(selected)}
              onValueChange={(value) => chooseQuality(Number(value))}
              options={[
                { value: '-1', label: 'Automatic' },
                ...qualities.map((quality) => ({
                  value: String(quality.index),
                  label: quality.label,
                })),
              ]}
            />
          </div>
          {playing ? <span className="text-muted-foreground">Now playing {playing}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
