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
  Cast,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Headphones,
  List,
  Lock,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  SkipBack,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  channelByNumber,
  formatBehind,
  type LiveRefusal,
  liveHref,
  moreBeginWith,
  neighbour,
  onNow,
  positionAt,
  programmeAt,
  refusalOf,
  startOverPosition,
} from '@/lib/live';
import { FIT_LABELS, type FitMode, fitStyle, setPlayerSettings } from '@/lib/player-settings';
import type { Channel, Guide, LivePlayback } from '@/lib/types';
import { readStreamLimit, type StreamLimitRefusal } from '@/lib/streams';
import { authHref } from '@/lib/viewer-api';
import { StreamLimitGate, StreamStoppedGate, useStreamPlace } from './stream-gates';
import { ChannelLineup } from './channel-lineup';
import { ChannelBanner, NumberTuner } from './live/channel-banner';
import { GuideOverlay, type GuideChoice } from './live/guide-overlay';
import { useFavourites } from './live/use-favourites';
import { brightnessFilter } from './player/gestures';
import { type Setting, SettingsMenu } from './player/settings-menu';
import { type Shortcut, ShortcutsSheet } from './player/shortcuts-sheet';
import { StatsPanel, usePlaybackStats } from './player/stats-panel';
import { TouchSurface } from './player/touch-surface';
import { usePlayerSettings } from './player/use-player-settings';
import {
  useAudioChain,
  usePictureInPicture,
  useRemotePlayback,
} from './player/use-player-hardware';
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
/** The value that stands for letting the player pick the rung itself. */
const AUTOMATIC = -1;
/** How long a typed channel number waits for another digit before it tunes. */
const TUNE_AFTER_MS = 1400;
/** How far ahead the guide over the picture reaches. */
const GUIDE_HOURS = 12;
/** The channel last watched, so one key flips back to it. */
const LAST_KEY = 'onyx.web.last-channel';
const FIT_ORDER: FitMode[] = ['fit', 'fill', 'zoom', 'stretch'];

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
  const router = useRouter();
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [brightness, setBrightness] = useState(1);
  /** Sound only, for watching on a connection that is paid for by the megabyte. */
  const [audioOnly, setAudioOnly] = useState(false);
  /** The digits of a channel number as they are typed, as on a remote control. */
  const [digits, setDigits] = useState('');
  /** Raised on every change, to show the banner again. */
  const [bannerSignal, setBannerSignal] = useState(0);

  const settings = usePlayerSettings();
  const { marked, toggle: toggleFavourite } = useFavourites();
  const pip = usePictureInPicture(videoRef);
  const remote = useRemotePlayback(videoRef);
  useAudioChain(videoRef, settings.boost, settings.nightMode, remote.connected);

  // The rungs the channel offers, and the one that is playing.
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(AUTOMATIC);
  const [playingHeight, setPlayingHeight] = useState<number | null>(null);

  const chooseLevel = useCallback((index: number) => {
    setLevel(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }, []);

  const settingsList: Setting[] = [
    {
      kind: 'choice',
      name: 'Quality',
      selected: level,
      onChoose: chooseLevel,
      choices: [
        {
          value: AUTOMATIC,
          label:
            level === AUTOMATIC && playingHeight ? `Automatic (${playingHeight}p)` : 'Automatic',
        },
        ...levels.map((rung) => ({ value: rung.index, label: `${rung.height}p` })),
      ],
    },
    {
      kind: 'switch',
      name: 'Sound only',
      on: audioOnly,
      onChange: setAudioOnly,
      note: 'Holds the channel at its smallest picture, for a connection that is paid for.',
    },
    {
      kind: 'page',
      name: 'Picture and sound',
      summary: FIT_LABELS[settings.fit],
      items: [
        {
          kind: 'choice',
          name: 'How it fills the window',
          selected: FIT_ORDER.indexOf(settings.fit),
          onChoose: (index) => setPlayerSettings({ fit: FIT_ORDER[index] ?? 'fit' }),
          choices: FIT_ORDER.map((mode, index) => ({ value: index, label: FIT_LABELS[mode] })),
        },
        {
          kind: 'range',
          name: 'Brightness',
          min: 0.2,
          max: 1,
          step: 0.05,
          value: brightness,
          format: (value) => `${Math.round(value * 100)}%`,
          onChange: setBrightness,
          onReset: brightness === 1 ? undefined : () => setBrightness(1),
        },
        {
          kind: 'range',
          name: 'Louder than the channel',
          min: 1,
          max: 3,
          step: 0.1,
          value: settings.boost,
          format: (value) => `${Math.round(value * 100)}%`,
          onChange: (boost) => setPlayerSettings({ boost }),
          onReset: settings.boost === 1 ? undefined : () => setPlayerSettings({ boost: 1 }),
        },
        {
          kind: 'switch',
          name: 'Night mode',
          on: settings.nightMode,
          onChange: (nightMode) => setPlayerSettings({ nightMode }),
          note: 'Pulls the loud parts down, so speech can be heard quietly.',
        },
      ],
    },
    {
      kind: 'switch',
      name: 'Show the figures',
      on: statsOpen,
      onChange: setStatsOpen,
      note: 'What the picture, the line and the servers are doing.',
    },
    {
      kind: 'choice',
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

  const shortcuts: Shortcut[] = [
    { keys: ['0', '…', '9'], what: 'Tune to that channel number' },
    { keys: ['↑', '↓'], what: 'The channel before and after' },
    { keys: ['P'], what: 'Back to the channel before this one' },
    { keys: ['G'], what: 'The guide' },
    { keys: ['L'], what: 'The list of channels' },
    { keys: ['Space', 'K'], what: 'Play and pause' },
    ...(keeps ? [{ keys: ['←', '→'], what: 'Go back and forward in what is kept' }] : []),
    { keys: ['M'], what: 'Mute' },
    { keys: ['V'], what: 'How the picture fills the window' },
    { keys: ['F'], what: 'Full screen' },
    { keys: ['I'], what: 'The small floating window' },
    { keys: ['D'], what: 'The figures behind the playback' },
    { keys: ['?'], what: 'This list' },
  ];

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
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const seen = new Set<number>();
        setLevels(
          data.levels
            .map((rung, index) => ({ index, height: rung.height }))
            .filter((rung) => rung.height > 0 && !seen.has(rung.height) && seen.add(rung.height))
            .sort((a, b) => b.height - a.height),
        );
        setLevel(AUTOMATIC);
        start();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const rung = hls.levels[data.level];
        setPlayingHeight(rung?.height ?? null);
        quality.current?.level(rung?.height ?? null, rung?.bitrate ?? null);
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

  // --- The guide, the last channel and the sound-only mode -------------------

  // The guide is asked for the first time it is opened, and kept afterwards.
  useEffect(() => {
    if (!guideOpen || guide) {
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/v1/catalog/guide?hours=${GUIDE_HOURS}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Guide>) : null))
      .then((answer) => {
        if (answer) {
          setGuide(answer);
        }
      })
      // Without the guide the overlay says so; the picture keeps playing.
      .catch(() => undefined);
    return () => controller.abort();
  }, [guideOpen, guide]);

  // The channel watched before this one, for the key that flips back.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    try {
      previous.current = window.sessionStorage.getItem(LAST_KEY);
      window.sessionStorage.setItem(LAST_KEY, channel.slug);
    } catch {
      // Storage can be switched off. The flip then works within this page.
    }
    setBannerSignal((signal) => signal + 1);
  }, [channel.slug]);

  // Sound only holds the ladder at its lowest rung, which is what makes it
  // worth having on a connection paid for by the megabyte.
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) {
      return;
    }
    hls.autoLevelCapping = audioOnly ? 0 : -1;
    if (audioOnly) {
      hls.currentLevel = 0;
      setLevel(0);
    }
  }, [audioOnly, levels]);

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

  /** Goes to a channel by the number typed on the keyboard. */
  const tuneTo = useCallback(
    (number: number) => {
      const wanted = channelByNumber(channels, number);
      if (wanted && wanted.slug !== channel.slug) {
        router.push(liveHref(wanted.slug));
      }
      setDigits('');
    },
    [channels, channel.slug, router],
  );

  // Digits are gathered the way a remote control gathers them: 1 waits, in
  // case 12 is coming, and tunes by itself when nothing longer could follow.
  const tuneTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (digits === '') {
      return undefined;
    }
    const wait = moreBeginWith(channels, digits) ? TUNE_AFTER_MS : 450;
    tuneTimer.current = window.setTimeout(() => tuneTo(Number(digits)), wait);
    return () => window.clearTimeout(tuneTimer.current);
  }, [digits, channels, tuneTo]);

  const goBack = useCallback(() => {
    const slug = previous.current;
    if (slug && slug !== channel.slug) {
      router.push(liveHref(slug));
    }
  }, [channel.slug, router]);

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
      // Keys inside the list of channels, or the guide, belong to them.
      if (lineup || guideOpen || shortcutsOpen) {
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        setDigits((typed) => (typed + event.key).slice(0, 4));
        wake();
        return;
      }
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        m: toggleMute,
        f: toggleFullscreen,
        l: () => setLineup(true),
        g: () => setGuideOpen(true),
        i: pip.toggle,
        d: () => setStatsOpen((open) => !open),
        p: goBack,
        Backspace: () => setDigits((typed) => typed.slice(0, -1)),
        '?': () => setShortcutsOpen(true),
        v: () => {
          const next = FIT_ORDER[(FIT_ORDER.indexOf(settings.fit) + 1) % FIT_ORDER.length];
          setPlayerSettings({ fit: next ?? 'fit' });
        },
        ArrowUp: () => onZap(-1),
        ArrowDown: () => onZap(1),
        ...(keeps ? { ArrowLeft: () => skip(-10), ArrowRight: () => skip(10) } : {}),
      };
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      // A button that has the focus answers the space bar itself.
      if (action && !(event.key === ' ' && target?.tagName === 'BUTTON')) {
        event.preventDefault();
        action();
        wake();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    lineup,
    guideOpen,
    shortcutsOpen,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    onZap,
    wake,
    keeps,
    skip,
    pip.toggle,
    goBack,
    settings.fit,
  ]);

  // The programme that is on, if it began within what is kept and the viewer is past its start.
  const running = onNow(channel, Date.now()).now;
  const startOver =
    keeps && running && range
      ? startOverPosition(running.startsAt, zeroAt, range.start, range.current)
      : null;
  const behindSeconds = range ? Math.max(0, range.end - range.current) : 0;

  /** Where in the video a moment of the world lies, for the guide to jump to. */
  const positionOf = useCallback(
    (at: number) => (keeps ? positionAt(at, zeroAt, range) : null),
    [keeps, zeroAt, range],
  );

  // The row of this channel in the guide, for the marks on the bar and for
  // naming what is playing while the viewer is behind.
  const ownRow = guide?.channels.find((row) => row.slug === channel.slug)?.programmes ?? [];
  /** What the picture is showing, which is not "now" once the viewer goes back. */
  const watching =
    zeroAt !== null && range && ownRow.length > 0
      ? programmeAt(ownRow, zeroAt + range.current * 1000)
      : null;

  // The programmes inside what the channel keeps, drawn as marks on the bar
  // so that going back lands on a beginning rather than in the middle.
  const marks =
    keeps && range && zeroAt !== null && range.end > range.start
      ? ownRow
          .map((programme) => ({
            programme,
            position: (new Date(programme.startsAt).getTime() - zeroAt) / 1000,
          }))
          .filter((mark) => mark.position > range.start + 8 && mark.position < range.end - 4)
          .map((mark) => ({
            ...mark,
            at: (mark.position - range.start) / (range.end - range.start),
          }))
      : [];

  /** The beginning of the programme before the one being watched, to step back. */
  const previousStart = (() => {
    if (!keeps || !range || zeroAt === null || !watching) {
      return null;
    }
    const index = ownRow.indexOf(watching);
    const before = index > 0 ? ownRow[index - 1] : undefined;
    return before ? positionOf(new Date(before.startsAt).getTime()) : null;
  })();

  const picture = fitStyle(settings.fit);
  const stats = usePlaybackStats(videoRef, hlsRef, statsOpen, true);

  /** The guide hands back a channel to tune to, or a place to go back to. */
  const onGuideChoice = useCallback(
    (choice: GuideChoice) => {
      setGuideOpen(false);
      if (choice.channel.slug !== channel.slug) {
        router.push(liveHref(choice.channel.slug));
        return;
      }
      if (choice.position !== null) {
        seekTo(choice.position);
      }
    },
    [channel.slug, router, seekTo],
  );

  const shown = controls || !playing || lineup || menuOpen || guideOpen;
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
        className={`size-full transition-[transform,filter,opacity] duration-200 ${
          audioOnly ? 'opacity-0' : ''
        }`}
        style={{
          objectFit: picture.objectFit,
          transform: picture.scale === 1 ? undefined : `scale(${picture.scale})`,
          filter: brightnessFilter(brightness),
        }}
        playsInline
        aria-label={`${channel.name}, live`}
      />

      {/* The picture itself, as something to click, tap, hold and drag. */}
      <TouchSurface
        step={10}
        holdRate={1}
        volume={muted ? 0 : volume}
        brightness={brightness}
        onSkip={keeps ? skip : () => undefined}
        onTogglePlay={togglePlay}
        onToggleFullscreen={toggleFullscreen}
        onVolume={(value) => {
          const video = videoRef.current;
          if (video) {
            video.volume = value;
            video.muted = value === 0;
          }
        }}
        onBrightness={setBrightness}
        onRate={() => undefined}
        onWake={wake}
        onTap={wake}
      />

      {audioOnly ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Headphones className="size-10 text-sard" aria-hidden="true" />
          <p className="heading text-xl">{channel.name}</p>
          {running ? <p className="text-sm text-smoke">{running.title}</p> : null}
          <p className="text-xs text-dust">Sound only. The picture is off to save data.</p>
        </div>
      ) : null}

      {waiting && !audioOnly ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-smoke"
        >
          Tuning in to {channel.name}
        </p>
      ) : null}

      <ChannelBanner channel={channel} signal={bannerSignal} />
      <NumberTuner digits={digits} />

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
          <div className="relative mb-1">
            <input
              type="range"
              min={Math.floor(range.start)}
              max={Math.floor(range.end)}
              step={1}
              value={Math.floor(range.current)}
              aria-label="Position in what the channel has kept"
              aria-valuetext={behind ? `${formatBehind(behindSeconds)} behind live` : 'Live'}
              className="block h-5 w-full accent-sard"
              onChange={(event) => seekTo(Number(event.target.value))}
            />
            {/*
              Where each programme began inside what is kept, so that going
              back lands on a beginning and not in the middle of something.
            */}
            {marks.map((mark) => (
              <button
                key={mark.programme.startsAt}
                type="button"
                title={`${mark.programme.title}, from its beginning`}
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-vein/70 hover:h-4 hover:bg-vein"
                style={{ left: `${mark.at * 100}%` }}
                onClick={() => seekTo(mark.position)}
              >
                <span className="sr-only">Start {mark.programme.title} from its beginning</span>
              </button>
            ))}
          </div>
        ) : null}
        {watching && behind ? (
          <p className="mb-1 truncate text-xs text-smoke">Watching {watching.title}</p>
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

          {previousStart !== null ? (
            <button
              type="button"
              className={button}
              aria-label="The beginning of the programme before this one"
              onClick={() => seekTo(previousStart)}
            >
              <SkipBack className="size-5" />
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={button}
              aria-label={
                marked.includes(channel.slug)
                  ? 'Take this channel out of the favourites'
                  : 'Make this channel a favourite'
              }
              aria-pressed={marked.includes(channel.slug)}
              onClick={() => toggleFavourite(channel.slug)}
            >
              <Star
                className={`size-5 ${marked.includes(channel.slug) ? 'fill-sard text-sard' : ''}`}
              />
            </button>
            <button
              type="button"
              className={button}
              aria-label="Guide"
              aria-expanded={guideOpen}
              onClick={() => setGuideOpen(true)}
            >
              <CalendarDays className="size-6" />
            </button>
            {channels.length > 1 ? (
              <>
                <button
                  type="button"
                  className={`${button} hidden sm:flex`}
                  aria-label="The channel before this one"
                  onClick={() => onZap(-1)}
                >
                  <ChevronUp className="size-6" />
                </button>
                <button
                  type="button"
                  className={`${button} hidden sm:flex`}
                  aria-label="The channel after this one"
                  onClick={() => onZap(1)}
                >
                  <ChevronDown className="size-6" />
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label="Channels"
                  aria-expanded={lineup}
                  onClick={() => setLineup((open) => !open)}
                >
                  <List className="size-6" />
                </button>
              </>
            ) : null}
            {remote.available ? (
              <button
                type="button"
                aria-label={
                  remote.connected ? 'Playing on another device' : 'Play on another device'
                }
                aria-pressed={remote.connected}
                className={`${button} ${remote.connected ? 'text-sard' : ''}`}
                onClick={remote.prompt}
              >
                <Cast className="size-6" />
              </button>
            ) : null}
            {pip.supported ? (
              <button
                type="button"
                aria-label={pip.active ? 'Back into the page' : 'Play in a small window'}
                aria-pressed={pip.active}
                className={`${button} ${pip.active ? 'text-sard' : ''}`}
                onClick={pip.toggle}
              >
                <PictureInPicture2 className="size-6" />
              </button>
            ) : null}
            <SettingsMenu open={menuOpen} onOpenChange={setMenuOpen} settings={settingsList} />
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
            <ChannelLineup channels={channels} current={channel.slug} compact searchable />
          </div>
        </aside>
      ) : null}

      {guideOpen ? (
        <GuideOverlay
          channels={channels}
          guide={guide}
          current={channel.slug}
          favourites={marked}
          onToggleFavourite={toggleFavourite}
          positionOf={positionOf}
          onChoose={onGuideChoice}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}

      {statsOpen ? (
        <StatsPanel
          reading={stats}
          sharing={playback.p2p && canShare() ? { on: sharingOn, figures: shared } : null}
          onClose={() => setStatsOpen(false)}
        />
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsSheet shortcuts={shortcuts} onClose={() => setShortcutsOpen(false)} />
      ) : null}
    </div>
  );
}
