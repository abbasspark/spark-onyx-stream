// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ensureMediaAllowed, FAILED_LOADS_BEFORE_MOVING } from '@/lib/delivery';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatClock } from '@/lib/format';
import type { Playback } from '@/lib/types';
import { parsePreviewTrack, type PreviewCue } from '@/lib/vtt';
import { SeekBar } from './seek-bar';
import { type ChoiceGroup, SettingsMenu } from './settings-menu';

const SKIP_SECONDS = 10;
const HIDE_CONTROLS_AFTER_MS = 3000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VOLUME_KEY = 'onyx.web.volume';
/** Value that stands for "automatic" quality and "no" subtitles. */
const NONE = -1;

interface Quality {
  /** Index of the level in hls.js. */
  index: number;
  height: number;
}

interface TextTrackChoice {
  id: number;
  label: string;
}

interface PlayerProps {
  playback: Playback;
  /** Name of the movie or the series. */
  heading: string;
  /** For an episode: "S1 E3 The Trench". */
  detail: string | null;
  backHref: string;
  /** Seconds to start from. */
  startAt: number;
  /** Raising this number jumps to the beginning. */
  restartSignal: number;
  onTime: (position: number, duration: number) => void;
  onEnded: () => void;
  /** Playback broke for good. The message is written for the viewer. */
  /**
   * The video cannot go on. "network" says that the server did not answer,
   * which another server may.
   */
  onFatal: (message: string, network?: boolean) => void;
  /** Drawn over the video, above the controls: the end screen. */
  overlay?: ReactNode;
}

/** The name of a language for a code such as "en", for subtitle tracks without a name. */
function languageLabel(code: string | undefined, fallback: string): string {
  if (!code) {
    return fallback;
  }
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

function readVolume(): { volume: number; muted: boolean } {
  try {
    const stored = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? 'null') as {
      volume?: unknown;
      muted?: unknown;
    } | null;
    const volume = typeof stored?.volume === 'number' ? stored.volume : 1;
    return { volume: Math.min(1, Math.max(0, volume)), muted: stored?.muted === true };
  } catch {
    return { volume: 1, muted: false };
  }
}

/** Whether a key press belongs to a control that handles it itself. */
function isOwnedByControl(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return false;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
    return true;
  }
  // Enter presses the focused button and must not do anything else.
  if (event.key === 'Enter' && target.closest('button, a') !== null) {
    return true;
  }
  // Space plays and pauses wherever the focus is, as people expect of a
  // player, except in a list of choices, where it chooses.
  return event.key === ' ' && target.closest('[data-own-keys]') !== null;
}

/**
 * The video player of the watch page: the whole screen, with its own controls.
 *
 * Plays HLS through hls.js, or through the browser itself where hls.js does
 * not run (Safari on iPhone). Keys: Space or K play and pause, the arrows skip
 * and change the volume, M mutes, F is full screen, C switches subtitles.
 */
export function Player({
  playback,
  heading,
  detail,
  backHref,
  startAt,
  restartSignal,
  onTime,
  onEnded,
  onFatal,
  overlay,
}: PlayerProps) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  // The newest callbacks, so the effects below do not restart when they change.
  const callbacks = useRef({ onTime, onEnded, onFatal });
  callbacks.current = { onTime, onEnded, onFatal };

  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(startAt);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQuality] = useState(NONE);
  const [playingHeight, setPlayingHeight] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrackChoice[]>([]);
  const [textTrack, setTextTrack] = useState(NONE);
  const [previews, setPreviews] = useState<PreviewCue[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // --- Loading the stream ---------------------------------------------------

  useEffect(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    const source = playback.manifestUrl;
    if (!ensureMediaAllowed(source)) {
      return;
    }
    setQualities([]);
    setQuality(NONE);
    setPlayingHeight(null);
    setTextTracks([]);
    setTextTrack(NONE);
    setWaiting(true);

    const stored = readVolume();
    element.volume = stored.volume;
    element.muted = stored.muted;

    const begin = () => {
      // Browsers refuse to start with sound unless the viewer just clicked.
      // The big play button stays then, and one click starts it.
      void element.play().catch(() => undefined);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        startPosition: startAt > 0 ? startAt : -1,
        // No point in loading 1080p into a small window.
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;
      let recovered = false;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const seen = new Set<number>();
        setQualities(
          data.levels
            .map((level, index) => ({ index, height: level.height }))
            .filter(
              (level) => level.height > 0 && !seen.has(level.height) && seen.add(level.height),
            )
            .sort((a, b) => b.height - a.height),
        );
        begin();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setPlayingHeight(hls.levels[data.level]?.height ?? null);
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        setTextTracks(
          data.subtitleTracks.map((track) => ({
            id: track.id,
            label: track.name || languageLabel(track.lang, `Track ${track.id + 1}`),
          })),
        );
      });
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_event, data) => setTextTrack(data.id));
      // The player tries a part that fails again and again, for most of a
      // minute. When several fail in a row the server is likely gone, and
      // asking for another one is quicker than waiting.
      let failedLoads = 0;
      hls.on(Hls.Events.FRAG_LOADED, () => {
        failedLoads = 0;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            failedLoads += 1;
            if (failedLoads === FAILED_LOADS_BEFORE_MOVING) {
              callbacks.current.onFatal(
                'The video could not be loaded. Check your connection.',
                true,
              );
            }
          }
          return;
        }
        // A decoding hiccup can often be repaired once without the viewer noticing.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          hls.recoverMediaError();
          return;
        }
        callbacks.current.onFatal(
          data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? 'The video could not be loaded. Check your connection.'
            : 'The video stopped because of a playback problem.',
          data.type === Hls.ErrorTypes.NETWORK_ERROR,
        );
      });
      hls.loadSource(source);
      hls.attachMedia(element);

      return () => {
        hlsRef.current = null;
        hls.destroy();
      };
    }

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      const onLoaded = () => {
        if (startAt > 0) {
          element.currentTime = startAt;
        }
        setTextTracks(
          [...element.textTracks]
            .filter((track) => track.kind === 'subtitles' || track.kind === 'captions')
            .map((track, id) => ({
              id,
              label: track.label || languageLabel(track.language, `Track ${id + 1}`),
            })),
        );
        begin();
      };
      const onError = () =>
        callbacks.current.onFatal('The video could not be loaded. Check your connection.', true);
      element.addEventListener('loadedmetadata', onLoaded, { once: true });
      element.addEventListener('error', onError);
      element.src = source;
      return () => {
        element.removeEventListener('loadedmetadata', onLoaded);
        element.removeEventListener('error', onError);
        element.removeAttribute('src');
        element.load();
      };
    }

    callbacks.current.onFatal('This browser cannot play this video.');
    return undefined;
    // The start position only matters when a stream is first loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.manifestUrl]);

  // --- Seek-bar previews ----------------------------------------------------

  useEffect(() => {
    setPreviews([]);
    if (!playback.thumbnailTrackUrl) {
      return;
    }
    const controller = new AbortController();
    const url = new URL(playback.thumbnailTrackUrl, window.location.href).toString();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => setPreviews(parsePreviewTrack(text, url)))
      // Previews are a nicety. Without them the bar still shows the time.
      .catch(() => undefined);
    return () => controller.abort();
  }, [playback.thumbnailTrackUrl]);

  // --- Following the video element -----------------------------------------

  useEffect(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    const onTimeUpdate = () => {
      setTime(element.currentTime);
      callbacks.current.onTime(element.currentTime, element.duration);
    };
    const onProgress = () => {
      // The loaded range that the current position is in.
      for (let index = 0; index < element.buffered.length; index += 1) {
        if (
          element.buffered.start(index) <= element.currentTime + 0.5 &&
          element.buffered.end(index) >= element.currentTime
        ) {
          setBuffered(element.buffered.end(index));
          return;
        }
      }
    };
    const onVolume = () => {
      setVolume(element.volume);
      setMuted(element.muted);
      try {
        window.localStorage.setItem(
          VOLUME_KEY,
          JSON.stringify({ volume: element.volume, muted: element.muted }),
        );
      } catch {
        // Storage can be blocked. The volume then lasts for this page only.
      }
    };
    const handlers: [string, () => void][] = [
      ['timeupdate', onTimeUpdate],
      ['progress', onProgress],
      [
        'durationchange',
        () => setDuration(Number.isFinite(element.duration) ? element.duration : 0),
      ],
      ['play', () => setPaused(false)],
      ['pause', () => setPaused(true)],
      ['playing', () => (setWaiting(false), setStarted(true))],
      ['waiting', () => setWaiting(true)],
      ['canplay', () => setWaiting(false)],
      ['seeking', () => setTime(element.currentTime)],
      ['ratechange', () => setRate(element.playbackRate)],
      ['volumechange', onVolume],
      ['ended', () => callbacks.current.onEnded()],
    ];
    for (const [name, handler] of handlers) {
      element.addEventListener(name, handler);
    }
    setVolume(element.volume);
    setMuted(element.muted);
    return () => {
      for (const [name, handler] of handlers) {
        element.removeEventListener(name, handler);
      }
    };
  }, []);

  useEffect(() => {
    if (restartSignal > 0 && video.current) {
      video.current.currentTime = 0;
      void video.current.play().catch(() => undefined);
    }
  }, [restartSignal]);

  // --- Actions --------------------------------------------------------------

  const togglePlay = useCallback(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    if (element.paused) {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const element = video.current;
    if (element && Number.isFinite(element.duration)) {
      element.currentTime = Math.min(element.duration, Math.max(0, seconds));
    }
  }, []);

  const skip = useCallback(
    (seconds: number) => seekTo((video.current?.currentTime ?? 0) + seconds),
    [seekTo],
  );

  const changeVolume = useCallback((next: number) => {
    const element = video.current;
    if (element) {
      element.volume = Math.min(1, Math.max(0, next));
      element.muted = element.volume === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    element.muted = !element.muted;
    // Unmuting at volume zero would change nothing anyone can hear.
    if (!element.muted && element.volume === 0) {
      element.volume = 0.5;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const box = container.current;
    if (box?.requestFullscreen) {
      void box.requestFullscreen().catch(() => undefined);
      return;
    }
    // iPhones only allow the video element itself to fill the screen.
    (
      video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    )?.webkitEnterFullscreen?.();
  }, []);

  const chooseQuality = useCallback((index: number) => {
    setQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }, []);

  const chooseTextTrack = useCallback((id: number) => {
    setTextTrack(id);
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleDisplay = id !== NONE;
      hls.subtitleTrack = id;
      return;
    }
    const tracks = [...(video.current?.textTracks ?? [])].filter(
      (track) => track.kind === 'subtitles' || track.kind === 'captions',
    );
    tracks.forEach((track, index) => {
      track.mode = index === id ? 'showing' : 'disabled';
    });
  }, []);

  const chooseRate = useCallback((index: number) => {
    if (video.current) {
      video.current.playbackRate = SPEEDS[index] ?? 1;
    }
  }, []);

  // --- Showing and hiding the controls -------------------------------------

  const wake = useCallback(() => {
    setControlsShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsShown(false), HIDE_CONTROLS_AFTER_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // They stay while the video is paused, a menu is open or the end screen shows.
  const pinned = paused || menuOpen || Boolean(overlay);
  const visible = controlsShown || pinned;

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  // --- Keys -----------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isOwnedByControl(event)) {
        return;
      }
      const element = video.current;
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => skip(-SKIP_SECONDS),
        ArrowRight: () => skip(SKIP_SECONDS),
        j: () => skip(-SKIP_SECONDS),
        l: () => skip(SKIP_SECONDS),
        ArrowUp: () => changeVolume((element?.volume ?? 1) + 0.1),
        ArrowDown: () => changeVolume((element?.volume ?? 1) - 0.1),
        m: toggleMute,
        f: toggleFullscreen,
        c: () => {
          if (textTracks.length > 0) {
            chooseTextTrack(textTrack === NONE ? (textTracks[0]?.id ?? NONE) : NONE);
          }
        },
      };
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (action) {
        event.preventDefault();
        action();
        wake();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    togglePlay,
    skip,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    chooseTextTrack,
    textTrack,
    textTracks,
    wake,
  ]);

  // --- Pointer on the picture ----------------------------------------------

  const onSurfacePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.pointerType === 'mouse') {
      if (event.button === 0) {
        togglePlay();
      }
      return;
    }
    // A finger first brings the controls back. A second tap hides them again.
    if (visible && !pinned) {
      window.clearTimeout(hideTimer.current);
      setControlsShown(false);
    } else {
      wake();
    }
  };

  const groups = useMemo<ChoiceGroup[]>(
    () => [
      {
        name: 'Quality',
        selected: quality,
        onChoose: chooseQuality,
        choices: [
          {
            value: NONE,
            label:
              quality === NONE && playingHeight ? `Automatic (${playingHeight}p)` : 'Automatic',
          },
          ...qualities.map((item) => ({ value: item.index, label: `${item.height}p` })),
        ],
      },
      {
        name: 'Subtitles',
        selected: textTrack,
        onChoose: chooseTextTrack,
        choices:
          textTracks.length > 0
            ? [
                { value: NONE, label: 'Off' },
                ...textTracks.map((track) => ({ value: track.id, label: track.label })),
              ]
            : [],
      },
      {
        name: 'Speed',
        selected: Math.max(0, SPEEDS.indexOf(rate)),
        onChoose: chooseRate,
        choices: SPEEDS.map((speed, index) => ({
          value: index,
          label: speed === 1 ? 'Normal' : `${speed}×`,
        })),
      },
    ],
    [
      quality,
      qualities,
      playingHeight,
      textTrack,
      textTracks,
      rate,
      chooseQuality,
      chooseTextTrack,
      chooseRate,
    ],
  );

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const shownVolume = muted ? 0 : volume;

  return (
    <div
      ref={container}
      className={`relative h-dvh w-full overflow-hidden bg-onyx select-none ${visible ? '' : 'cursor-none'}`}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') {
          wake();
        }
      }}
    >
      <video
        ref={video}
        playsInline
        poster={playback.posterUrl ?? undefined}
        aria-label={detail ? `${heading}, ${detail}` : heading}
        className="absolute inset-0 size-full object-contain"
      />

      {/* The surface that takes clicks and taps on the picture itself. */}
      <div
        className="absolute inset-0"
        onPointerUp={onSurfacePointerUp}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            toggleFullscreen();
          }
        }}
      />

      {waiting && !paused ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Loader2 className="size-14 animate-[player-spin_0.9s_linear_infinite] text-vein" />
          <span className="sr-only">Loading</span>
        </div>
      ) : null}

      {paused && !overlay && (!waiting || !started) ? (
        <button
          type="button"
          aria-label="Play"
          className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sard text-onyx transition-transform hover:scale-105"
          onClick={togglePlay}
        >
          <Play className="size-9 translate-x-0.5 fill-current" />
        </button>
      ) : null}

      {overlay}

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-onyx/80 to-transparent pb-16 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 px-[clamp(0.5rem,2vw,1.5rem)] pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href={backHref}
            aria-label={`Back to ${heading}`}
            className="player-button"
            tabIndex={visible ? 0 : -1}
          >
            <ArrowLeft />
          </Link>
          <div className="min-w-0">
            <p className="heading truncate text-lg">{heading}</p>
            {detail ? <p className="truncate text-sm text-vein/75">{detail}</p> : null}
          </div>
        </div>
      </div>

      <div
        // Hidden controls must not be reachable with the Tab key either.
        inert={!visible}
        className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-onyx/90 to-transparent px-[clamp(0.75rem,2.5vw,2rem)] pt-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-200 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <SeekBar
          time={time}
          duration={duration}
          buffered={buffered}
          previews={previews}
          onSeek={seekTo}
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            aria-label={paused ? 'Play' : 'Pause'}
            className="player-button"
            onClick={togglePlay}
          >
            {paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}
          </button>
          <button
            type="button"
            aria-label={`Back ${SKIP_SECONDS} seconds`}
            className="player-button"
            onClick={() => skip(-SKIP_SECONDS)}
          >
            <RotateCcw />
          </button>
          <button
            type="button"
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
            className="player-button"
            onClick={() => skip(SKIP_SECONDS)}
          >
            <RotateCw />
          </button>
          <div className="group/volume flex items-center">
            <button
              type="button"
              aria-label={muted || volume === 0 ? 'Turn the sound on' : 'Mute'}
              className="player-button"
              onClick={toggleMute}
            >
              <VolumeIcon />
            </button>
            {/* Phones set the volume with their own buttons. */}
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={shownVolume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              // The player's arrow keys would otherwise change the volume a second time.
              onKeyDown={(event) => event.stopPropagation()}
              style={{ ['--filled' as string]: `${shownVolume * 100}%` }}
              className="player-range hidden w-0 opacity-0 transition-[width,opacity] duration-150 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100 group-hover/volume:w-20 group-hover/volume:opacity-100 pointer-fine:block"
            />
          </div>
          <p className="ml-2 text-sm whitespace-nowrap tabular-nums">
            <span>{formatClock(time)}</span>
            <span className="text-vein/60"> / {formatClock(duration)}</span>
          </p>

          <div className="ml-auto flex items-center gap-1">
            <SettingsMenu open={menuOpen} onOpenChange={setMenuOpen} groups={groups} />
            <button
              type="button"
              aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
              className="player-button"
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
