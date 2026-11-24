// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ensureMediaAllowed, otherServerOf, withAvoid } from '@/lib/delivery';
import {
  canShare,
  createSharing,
  describeSharing,
  loadSharing,
  NO_SHARING,
  setSharingPreference,
  type Sharing,
  type SharingFigures,
  sharingPreference,
} from '@/lib/p2p';
import Hls from 'hls.js';
import type { ErrorCode } from '@/lib/quality';
import { errorCodeOf, errorWordsOf, useQualityReports } from './player/use-quality';
import {
  ArrowLeft,
  List,
  Lock,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatBehind,
  type LiveRefusal,
  liveHref,
  neighbour,
  onNow,
  refusalOf,
  startOverPosition,
} from '@/lib/live';
import type { Channel, LivePlayback } from '@/lib/types';
import { readStreamLimit, type StreamLimitRefusal } from '@/lib/streams';
import { authHref } from '@/lib/viewer-api';
import { StreamLimitGate, StreamStoppedGate, useStreamPlace } from './stream-gates';
import { ChannelLineup } from './channel-lineup';
import { type ChoiceGroup, SettingsMenu } from './player/settings-menu';
import { useViewerSession } from './viewer-session';

/** How often a channel that is off air is asked for again. */
const OFF_AIR_RETRY_MS = 8000;
/** Wait before a stream that broke is opened again. */
const BROKEN_RETRY_MS = 3000;
/** A picture that has not moved for this long, without the viewer pausing it, counts as broken. */
const STALL_GIVE_UP_MS = 12_000;
/** The controls go away after this long without a move of the pointer. */
const HIDE_CONTROLS_MS = 3500;
/** Further behind the newest picture than this, the viewer is offered to catch up. */
const BEHIND_SECONDS = 25;

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; playback: LivePlayback }
  | { state: 'refused'; reason: LiveRefusal }
  /** The account plays on as many devices as it may. */
  | { state: 'limit'; refusal: StreamLimitRefusal }
  /** The place of this device was taken away while it played. */
  | { state: 'stopped' };

interface LiveScreenProps {
  channel: Channel;
  /** The whole lineup, for switching without leaving the player. */
  channels: Channel[];
}

/**
 * The page that plays a live channel: the picture over the whole window,
 * with what stands in the way when it cannot be shown.
 */
export function LiveScreen({ channel, channels }: LiveScreenProps) {
  const router = useRouter();
  const { state: sessionState, viewer, access } = useViewerSession();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  /** The server the player just failed on, to be given another one. */
  const avoid = useRef<string | null>(null);

  useEffect(() => {
    if (sessionState === 'loading') {
      return undefined;
    }
    const controller = new AbortController();
    let timer: number | undefined;

    // Named once: if the next server fails too, it is that one's turn.
    const avoiding = avoid.current;
    avoid.current = null;
    fetch(withAvoid(`/v1/catalog/channels/${channel.slug}/playback`, avoiding), {
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) {
          return;
        }
        if (response.ok) {
          const playback = (await response.json()) as LivePlayback;
          if (playback.p2p) {
            await loadSharing();
          }
          if (!controller.signal.aborted) {
            setLoaded({ state: 'ready', playback });
          }
          return;
        }
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        // Asked first: the same status also says that a channel is off air.
        const limit = readStreamLimit(response.status, body);
        if (limit) {
          setLoaded({ state: 'limit', refusal: limit });
          return;
        }
        const reason = refusalOf(response.status, body?.code);
        setLoaded({ state: 'refused', reason });
        if (reason === 'off-air') {
          // A channel that comes on air starts playing by itself.
          timer = window.setTimeout(retry, OFF_AIR_RETRY_MS);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoaded({ state: 'refused', reason: 'failed' });
        }
      });
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // Signing in, or out, in this or another tab asks again.
  }, [channel.slug, attempt, sessionState, viewer?.id, retry]);

  const zap = useCallback(
    (step: 1 | -1) => {
      const next = neighbour(channels, channel.slug, step);
      if (next) {
        router.push(liveHref(next.slug));
      }
    },
    [channels, channel.slug, router],
  );

  const stoppedElsewhere = useStreamPlace(
    loaded.state === 'ready' ? loaded.playback.stream : null,
    retry,
  );
  useEffect(() => {
    if (stoppedElsewhere) {
      // The player goes away with this, and with it the picture and the sound.
      setLoaded((current) => (current.state === 'ready' ? { state: 'stopped' } : current));
    }
  }, [stoppedElsewhere]);

  if (loaded.state === 'ready') {
    return (
      <LivePlayer
        channel={channel}
        channels={channels}
        playback={loaded.playback}
        // The address ran out, the channel went off air or its server went
        // away: ask again, for another server, and see which.
        onBroken={() => {
          avoid.current = otherServerOf(loaded.playback.url, window.location.origin);
          retry();
        }}
        onZap={zap}
      />
    );
  }

  const here = liveHref(channel.slug);
  const refusal = loaded.state === 'refused' ? loaded.reason : null;
  return (
    <div className="flex min-h-dvh flex-col bg-onyx">
      <div className="gutter flex h-16 items-center">
        <Link href="/live" className="flex items-center gap-2 text-sm text-smoke hover:text-vein">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All channels
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
        {loaded.state === 'limit' ? (
          <StreamLimitGate refusal={loaded.refusal} heading={channel.name} onRetry={retry} />
        ) : loaded.state === 'stopped' ? (
          <StreamStoppedGate heading={channel.name} onRetry={retry} />
        ) : refusal === null ? (
          <p role="status" className="text-smoke">
            Tuning in to {channel.name}
          </p>
        ) : refusal === 'off-air' ? (
          <>
            <p className="display text-6xl text-dust tabular-nums" aria-hidden="true">
              {channel.number ?? ''}
            </p>
            <h1 className="display max-w-xl text-3xl sm:text-4xl">
              {channel.name} is off air right now
            </h1>
            <p role="status" className="max-w-md text-smoke">
              Leave this page open. The picture starts by itself when the channel is back.
            </p>
          </>
        ) : refusal === 'sign-in' ? (
          <>
            <h1 className="display max-w-xl text-3xl sm:text-4xl">
              Sign in to watch {channel.name}
            </h1>
            <p className="max-w-md text-smoke">
              {access?.registration === 'closed'
                ? 'Watching needs an account on this site.'
                : 'Watching needs an account. Creating one takes a minute.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={authHref('sign-in', here)} className="button button-play">
                Sign in
              </Link>
              {access?.registration === 'closed' ? null : (
                <Link href={authHref('sign-up', here)} className="button button-quiet">
                  Create an account
                </Link>
              )}
            </div>
          </>
        ) : refusal === 'subscribe' || refusal === 'other-plan' ? (
          <>
            <Lock className="size-8 text-sard" aria-hidden="true" />
            <h1 className="display max-w-xl text-3xl sm:text-4xl">
              {refusal === 'subscribe'
                ? `Subscribe to watch ${channel.name}`
                : `${channel.name} is not part of your plan`}
            </h1>
            <p className="max-w-md text-smoke">
              {refusal === 'subscribe'
                ? 'This channel is for subscribers.'
                : 'Your subscription opens other channels and titles. The page of plans shows which plan includes this one.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={`/plans?next=${encodeURIComponent(here)}`} className="button button-play">
                See the plans
              </Link>
              <button type="button" className="button button-quiet" onClick={retry}>
                I subscribed, play
              </button>
            </div>
          </>
        ) : refusal === 'confirm-email' ? (
          <>
            <h1 className="display max-w-xl text-3xl sm:text-4xl">
              Confirm your email address to watch
            </h1>
            <p className="max-w-md text-smoke">
              We sent a link to {viewer?.email ?? 'your address'} when you signed up. Your account
              page can send a new one.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/account" className="button button-play">
                Your account
              </Link>
              <button type="button" className="button button-quiet" onClick={retry}>
                I confirmed, play
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="display max-w-xl text-3xl sm:text-4xl">
              {refusal === 'gone'
                ? 'This channel is no longer here'
                : refusal === 'closed'
                  ? 'Watching is not open on this site'
                  : `${channel.name} could not be loaded`}
            </h1>
            {refusal === 'failed' ? (
              <>
                <p className="max-w-md text-smoke">
                  The site could not be reached. Check your connection.
                </p>
                <button type="button" className="button button-play" onClick={retry}>
                  Try again
                </button>
              </>
            ) : null}
          </>
        )}
        {channels.length > 1 && refusal !== null ? (
          <Link
            href="/live"
            className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
          >
            See what else is on
          </Link>
        ) : null}
      </div>
    </div>
  );
}

interface LivePlayerProps {
  channel: Channel;
  channels: Channel[];
  playback: LivePlayback;
  onBroken: () => void;
  onZap: (step: 1 | -1) => void;
}

function LivePlayer({ channel, channels, playback, onBroken, onZap }: LivePlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [muted, setMuted] = useState(false);
  // Sharing with other viewers: the viewer's choice, and how it goes.
  const sharingRef = useRef<Sharing | null>(null);
  const [sharingOn, setSharingOn] = useState(true);
  const [shared, setShared] = useState<SharingFigures>(NO_SHARING);
  const [menuOpen, setMenuOpen] = useState(false);
  const sharingDefault = playback.p2p?.sharingDefault ?? true;
  useEffect(() => setSharingOn(sharingPreference(sharingDefault)), [sharingDefault]);
  const chooseSharing = useCallback((value: number) => {
    const on = value === 1;
    setSharingPreference(on);
    setSharingOn(on);
    sharingRef.current?.setOn(on);
  }, []);
  const groups: ChoiceGroup[] = [
    {
      name: 'Share with viewers',
      selected: sharingOn ? 1 : 0,
      onChoose: chooseSharing,
      choices:
        playback.p2p && canShare()
          ? [
              { value: 1, label: 'On' },
              { value: 0, label: 'Off' },
            ]
          : [],
      note: describeSharing(shared, sharingOn),
    },
  ];
  const [volume, setVolume] = useState(1);
  const [behind, setBehind] = useState(false);
  // For a channel that lets viewers go back: the stretch that is kept, and where the viewer is in it.
  const keeps = (channel.dvrMinutes ?? 0) > 0;
  const [range, setRange] = useState<{ start: number; end: number; current: number } | null>(null);
  /** The moment in the world that position 0 of the video stands for. */
  const [zeroAt, setZeroAt] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [lineup, setLineup] = useState(false);

  // --- The stream -----------------------------------------------------------

  // How the playback goes, for the figures in the panel. Set up before the
  // channel is loaded, so the wait for the first picture is counted whole.
  const quality = useQualityReports(playback.qualityId, videoRef);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }
    let timer: number | undefined;
    const broken = (code: ErrorCode = 'other', words?: string) => {
      quality.current?.fail(code, words, video.currentTime);
      setWaiting(true);
      timer = window.setTimeout(onBroken, BROKEN_RETRY_MS);
    };
    const start = () => {
      // Browsers refuse sound nobody asked for. Then it starts silent, with a button to turn it on.
      video.play().catch(() => {
        video.muted = true;
        setMuted(true);
        video.play().catch(() => undefined);
      });
    };

    if (!ensureMediaAllowed(playback.url)) {
      return undefined;
    }

    // A server that goes away without a word leaves the player waiting for
    // ever. When the picture has stood still this long, ask for the channel
    // again, which may come from another server then.
    let sharing: Sharing | null = null;
    let lastTime = video.currentTime;
    let movedAt = Date.now();
    let gaveUp = false;
    const watchdog = window.setInterval(() => {
      if (video.paused || video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        movedAt = Date.now();
        return;
      }
      if (!gaveUp && Date.now() - movedAt > STALL_GIVE_UP_MS) {
        gaveUp = true;
        hlsRef.current?.destroy();
        hlsRef.current = null;
        broken('timeout', 'the picture stood still');
      }
    }, 2000);

    if (Hls.isSupported()) {
      // What was watched is dropped from memory after a minute. Going back loads it again.
      sharing = createSharing(playback.p2p, 'live', setShared);
      sharingRef.current = sharing;
      setShared(NO_SHARING);
      const hls = new Hls({
        liveSyncDurationCount: 3,
        backBufferLength: 60,
        ...sharing?.hlsConfig,
      });
      sharing?.bind(hls);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, start);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels[data.level];
        quality.current?.level(level?.height ?? null, level?.bitrate ?? null);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
          broken(errorCodeOf(data), errorWordsOf(data));
        }
      });
      hls.loadSource(playback.url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playback.url;
      video.addEventListener('loadedmetadata', start, { once: true });
      video.addEventListener('error', () => broken('network', video.error?.message || undefined), {
        once: true,
      });
    } else {
      broken('unsupported', 'no way to play HLS in this browser');
    }

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      sharingRef.current = null;
      sharing?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [playback.url, onBroken]);

  // --- What the video reports -------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onPlaying = () => setWaiting(false);
    const onWaiting = () => setWaiting(true);
    const onVolume = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    const onTime = () => {
      const end = video.seekable.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0;
      setBehind(end > 0 && end - video.currentTime > BEHIND_SECONDS);
      if (end > 0) {
        setRange({ start: video.seekable.start(0), end, current: video.currentTime });
      }
      // hls.js knows the date of what is playing. Safari knows the date of position 0.
      const playing = hlsRef.current?.playingDate?.getTime();
      const native = (video as HTMLVideoElement & { getStartDate?: () => Date })
        .getStartDate?.()
        .getTime();
      if (playing) {
        setZeroAt(playing - video.currentTime * 1000);
      } else if (native && !Number.isNaN(native)) {
        setZeroAt(native);
      }
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('timeupdate', onTime);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // --- What the viewer does ---------------------------------------------------

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
    }
  }, []);

  const seekTo = useCallback((position: number) => {
    const video = videoRef.current;
    if (video && video.seekable.length > 0) {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      video.currentTime = Math.min(Math.max(position, start + 4), end - 4);
    }
  }, []);
  const skip = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (video) {
        seekTo(video.currentTime + seconds);
      }
    },
    [seekTo],
  );

  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const position = hlsRef.current?.liveSyncPosition;
    if (typeof position === 'number') {
      video.currentTime = position;
    } else if (video.seekable.length > 0) {
      video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - 10);
    }
    void video.play().catch(() => undefined);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const frame = frameRef.current;
    const video = videoRef.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (frame?.requestFullscreen) {
      void frame.requestFullscreen().catch(() => undefined);
    } else {
      // iPhones only let the video itself fill the screen.
      video?.webkitEnterFullscreen?.();
    }
  }, []);

  // The controls show on any move and go away again while the picture runs.
  const hideTimer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(hideTimer.current);
  }, [wake]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.tagName === 'INPUT') {
        return;
      }
      if (event.key === 'Escape' && lineup) {
        setLineup(false);
        return;
      }
      // Keys inside the list of channels move through the list.
      if (lineup) {
        return;
      }
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        m: toggleMute,
        f: toggleFullscreen,
        l: () => setLineup(true),
        ArrowUp: () => onZap(-1),
        ArrowDown: () => onZap(1),
        ...(keeps ? { ArrowLeft: () => skip(-10), ArrowRight: () => skip(10) } : {}),
      };
      const action = actions[event.key];
      // A button that has the focus answers the space bar itself.
      if (action && !(event.key === ' ' && target?.tagName === 'BUTTON')) {
        event.preventDefault();
        action();
        wake();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lineup, togglePlay, toggleMute, toggleFullscreen, onZap, wake, keeps, skip]);

  // The programme that is on, if it began within what is kept and the viewer is past its start.
  const running = onNow(channel, Date.now()).now;
  const startOver =
    keeps && running && range
      ? startOverPosition(running.startsAt, zeroAt, range.start, range.current)
      : null;
  const behindSeconds = range ? Math.max(0, range.end - range.current) : 0;

  const shown = controls || !playing || lineup || menuOpen;
  const button =
    'flex size-11 items-center justify-center rounded-[3px] text-vein hover:bg-vein/15 focus-visible:bg-vein/15';

  return (
    <div
      ref={frameRef}
      className={`relative h-dvh overflow-hidden bg-onyx ${shown ? '' : 'cursor-none'}`}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <video
        ref={videoRef}
        className="size-full"
        playsInline
        onClick={togglePlay}
        aria-label={`${channel.name}, live`}
      />

      {waiting ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-smoke"
        >
          Tuning in to {channel.name}
        </p>
      ) : null}

      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-4 bg-linear-to-b from-onyx/85 to-transparent px-4 pt-3 pb-10 transition-opacity duration-200 sm:px-6 ${
          shown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <Link href="/live" aria-label="Back to all channels" className={button}>
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex min-w-0 items-baseline gap-3">
          {channel.number ? (
            <span className="display text-3xl tabular-nums" aria-hidden="true">
              {channel.number}
            </span>
          ) : null}
          <h1 className="heading truncate text-lg">{channel.name}</h1>
          {channel.now ? (
            <p className="hidden truncate text-sm text-smoke sm:block">{channel.now.title}</p>
          ) : null}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-onyx/90 to-transparent px-3 pt-12 pb-3 transition-opacity duration-200 sm:px-5 ${
          shown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {keeps && range && range.end - range.start > 30 ? (
          <input
            type="range"
            min={Math.floor(range.start)}
            max={Math.floor(range.end)}
            step={1}
            value={Math.floor(range.current)}
            aria-label="Position in what the channel has kept"
            aria-valuetext={behind ? `${formatBehind(behindSeconds)} behind live` : 'Live'}
            className="mb-1 block h-5 w-full accent-sard"
            onChange={(event) => seekTo(Number(event.target.value))}
          />
        ) : null}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={button}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={togglePlay}
          >
            {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
          </button>
          <button
            type="button"
            className={button}
            aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'}
            onClick={toggleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX className="size-6" />
            ) : (
              <Volume2 className="size-6" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            className="hidden w-24 accent-vein sm:block"
            onChange={(event) => {
              const video = videoRef.current;
              if (video) {
                video.volume = Number(event.target.value);
                video.muted = video.volume === 0;
              }
            }}
          />

          {behind ? (
            <button
              type="button"
              className="ml-3 flex h-9 items-center gap-2 rounded-[3px] border border-vein/40 px-3 text-sm hover:bg-vein/15"
              onClick={goLive}
            >
              <span className="size-2 rounded-full bg-dust" aria-hidden="true" />
              Back to live
              {keeps ? (
                <span className="text-smoke tabular-nums">−{formatBehind(behindSeconds)}</span>
              ) : null}
            </button>
          ) : (
            <span className="ml-3 flex h-9 items-center gap-2 px-1 text-sm font-medium">
              <span
                className="size-2 rounded-full bg-sard motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Live
            </span>
          )}

          {startOver !== null && running ? (
            <button
              type="button"
              className="ml-2 hidden h-9 items-center gap-2 rounded-[3px] border border-vein/40 px-3 text-sm hover:bg-vein/15 sm:flex"
              title={`Start “${running.title}” from its beginning`}
              onClick={() => seekTo(startOver)}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Start over
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            {channels.length > 1 ? (
              <button
                type="button"
                className={button}
                aria-label="Channels"
                aria-expanded={lineup}
                onClick={() => setLineup((open) => !open)}
              >
                <List className="size-6" />
              </button>
            ) : null}
            <SettingsMenu open={menuOpen} onOpenChange={setMenuOpen} groups={groups} />
            <button
              type="button"
              className={button}
              aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
            </button>
          </div>
        </div>
      </div>

      {muted && playing ? (
        <button
          type="button"
          className="button button-play absolute top-20 left-1/2 -translate-x-1/2"
          onClick={toggleMute}
        >
          <Volume2 />
          Turn the sound on
        </button>
      ) : null}

      {lineup ? (
        <aside
          aria-label="Channels"
          className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-line bg-onyx/95"
        >
          <div className="flex h-16 items-center justify-between px-4">
            <h2 className="heading text-lg">Channels</h2>
            <button
              type="button"
              className={button}
              aria-label="Close the list of channels"
              onClick={() => setLineup(false)}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ChannelLineup channels={channels} current={channel.slug} compact />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
