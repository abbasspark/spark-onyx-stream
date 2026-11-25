// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ensureMediaAllowed, FAILED_LOADS_BEFORE_MOVING } from '@/lib/delivery';
import {
  canShare,
  createSharing,
  describeSharing,
  NO_SHARING,
  setSharingPreference,
  type Sharing,
  type SharingFigures,
  sharingPreference,
} from '@/lib/p2p';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Cast,
  Loader2,
  Maximize,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import { errorCodeOf, errorWordsOf, useQualityReports } from './use-quality';
import { endOf, markerBands, runningMarker, skipLabel } from '@/lib/markers';
import {
  type AutoSkip,
  type DataSaver,
  DEFAULT_SETTINGS,
  FIT_LABELS,
  type FitMode,
  fitStyle,
  heightCap,
  SEEK_STEPS,
  SUBTITLE_COLORS,
  setPlayerSettings,
  setSubtitleLook,
} from '@/lib/player-settings';
import { type PlaybackPreferences, profilesApi } from '@/lib/profiles';
import { pickTrack } from '@/lib/tracks';
import type { Playback } from '@/lib/types';
import { parsePreviewTrack, type PreviewCue } from '@/lib/vtt';
import { useViewerSession } from '../viewer-session';
import { brightnessFilter } from './gestures';
import { AdLayer } from './ad-layer';
import { SeekBar } from './seek-bar';
import { type Setting, SettingsMenu } from './settings-menu';
import { type Shortcut, ShortcutsSheet } from './shortcuts-sheet';
import { StatsPanel, usePlaybackStats } from './stats-panel';
import { useAds } from './use-ads';
import { createCueAdjuster, subtitleProperties } from './subtitle-look';
import { TouchSurface } from './touch-surface';
import { usePlayerSettings } from './use-player-settings';
import {
  useAudioChain,
  useElementHeight,
  usePictureInPicture,
  useRemotePlayback,
} from './use-player-hardware';

const HIDE_CONTROLS_AFTER_MS = 3000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
/** How fast the picture runs while a finger rests on it. */
const HOLD_RATE = 2;
const VOLUME_KEY = 'onyx.web.volume';
/** Value that stands for "automatic" quality and "no" subtitles. */
const NONE = -1;
/** What the sleep timer offers, in minutes. 0 is off, -1 the end of this video. */
const SLEEP_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 15, label: 'In 15 minutes' },
  { value: 30, label: 'In 30 minutes' },
  { value: 60, label: 'In an hour' },
  { value: -1, label: 'At the end of this' },
];
const FIT_ORDER: FitMode[] = ['fit', 'fill', 'zoom', 'stretch'];
const SAVER_CHOICES: { value: DataSaver; label: string }[] = [
  { value: 'off', label: 'As good as it gets' },
  { value: '1080', label: 'Up to 1080p' },
  { value: '720', label: 'Up to 720p' },
  { value: '480', label: 'Up to 480p' },
];
const AUTO_SKIP_CHOICES: { value: AutoSkip; label: string }[] = [
  { value: 'off', label: 'Ask me' },
  { value: 'intro', label: 'Recap and opening' },
  { value: 'all', label: 'Recap, opening and credits' },
];

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
  /**
   * What is offered while the credits run, in place of sitting through
   * them: the next episode. Null when nothing comes next.
   */
  afterCredits?: { label: string; onPress: () => void } | null;
  /**
   * The viewer set the sleep timer to the end of this video, or took it off
   * again. Nothing that follows should start by itself while it is set.
   */
  onStopAtEnd?: (stop: boolean) => void;
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
 * and change the volume, M mutes, F is full screen, C switches subtitles,
 * S skips the recap, intro or credits that are running.
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
  afterCredits = null,
  onStopAtEnd,
}: PlayerProps) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  // The newest callbacks, so the effects below do not restart when they change.
  const callbacks = useRef({ onTime, onEnded, onFatal, onStopAtEnd });
  callbacks.current = { onTime, onEnded, onFatal, onStopAtEnd };

  // Ads in front of, in the middle of and after the video, for those who see them.
  const ads = useAds(playback.ads, video);
  const adsRef = useRef(ads);
  adsRef.current = ads;

  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(startAt);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  // Sharing with other viewers: the viewer's choice, and how it goes.
  const sharingRef = useRef<Sharing | null>(null);
  const [sharingOn, setSharingOn] = useState(true);
  const [shared, setShared] = useState<SharingFigures>(NO_SHARING);
  const sharingDefault = playback.p2p?.sharingDefault ?? true;
  useEffect(() => setSharingOn(sharingPreference(sharingDefault)), [sharingDefault]);
  const chooseSharing = useCallback((value: number) => {
    const on = value === 1;
    setSharingPreference(on);
    setSharingOn(on);
    sharingRef.current?.setOn(on);
  }, []);
  const canShareThis = playback.p2p !== null && playback.p2p !== undefined && canShare();
  const [rate, setRate] = useState(1);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQuality] = useState(NONE);
  const [playingHeight, setPlayingHeight] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrackChoice[]>([]);
  const [textTrack, setTextTrack] = useState(NONE);
  const [audioTracks, setAudioTracks] = useState<TextTrackChoice[]>([]);
  const [audioTrack, setAudioTrack] = useState(NONE);
  /** The language of each track, by its position, to remember what was chosen. */
  const audioLanguages = useRef<(string | undefined)[]>([]);
  const textLanguages = useRef<(string | undefined)[]>([]);

  // What the profile in use likes to hear and to read. A video starts with
  // it, and what the viewer picks in the menu becomes it.
  const { viewer, profile, chooseProfile, setProfile } = useViewerSession();
  const session = useRef({ viewer, profile, chooseProfile, setProfile });
  session.current = { viewer, profile, chooseProfile, setProfile };
  const remember = useCallback((change: Partial<PlaybackPreferences>) => {
    const { viewer: who, profile: current, chooseProfile: choosing } = session.current;
    if (!who || !current || choosing) {
      return;
    }
    const same = (Object.keys(change) as (keyof PlaybackPreferences)[]).every(
      (key) => (current[key] ?? null) === change[key],
    );
    if (same) {
      return;
    }
    // The page knows at once. The account learns it for the next device.
    session.current.setProfile({ ...current, ...change });
    profilesApi.setPreferences(change).catch(() => {
      // A choice that could not be kept still holds for this video.
    });
  }, []);
  const [previews, setPreviews] = useState<PreviewCue[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // What this device is set to: how the subtitles look, how the picture
  // fills the window, how loud it may get, what is skipped by itself.
  const settings = usePlayerSettings();
  const [statsOpen, setStatsOpen] = useState(settings.stats);
  /** Dimming by hand, for watching in the dark. 1 is the picture as it is. */
  const [brightness, setBrightness] = useState(1);
  /** When the sleep timer stops the video, or null while none is set. */
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  /** The sleep timer as it was chosen, for the menu to show. */
  const [sleepChoice, setSleepChoice] = useState(0);
  const [sleptOff, setSleptOff] = useState(false);

  const pip = usePictureInPicture(video);
  const remote = useRemotePlayback(video);
  const pictureHeight = useElementHeight(container);
  // Sound goes through the sound card only when it has something to do there,
  // and never while the picture is playing on another device.
  useAudioChain(video, settings.boost, settings.nightMode, remote.connected);

  // --- Loading the stream ---------------------------------------------------

  // How the playback goes, for the figures in the panel. Set up before the
  // video is loaded, so the wait for the first picture is counted whole.
  const reports = useQualityReports(playback.qualityId, video);

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
    setAudioTracks([]);
    setAudioTrack(NONE);
    audioLanguages.current = [];
    textLanguages.current = [];
    setWaiting(true);
    const liked = {
      audio: session.current.profile?.audioLanguage ?? null,
      subtitles: session.current.profile?.subtitleLanguage ?? null,
    };

    const stored = readVolume();
    element.volume = stored.volume;
    element.muted = stored.muted;

    const start = () => {
      // Browsers refuse to start with sound unless the viewer just clicked.
      // The big play button stays then, and one click starts it.
      void element.play().catch(() => reports.current?.hold());
    };
    // A break in front of the video goes first, and starts the video when it is over.
    const begin = () => {
      if (!adsRef.current.beforeStart(start)) {
        start();
      }
    };

    if (Hls.isSupported()) {
      // Parts of the video may come from other viewers. Null where they cannot.
      const sharing = createSharing(playback.p2p, 'video', setShared);
      sharingRef.current = sharing;
      setShared(NO_SHARING);
      const hls = new Hls({
        startPosition: startAt > 0 ? startAt : -1,
        // No point in loading 1080p into a small window.
        capLevelToPlayerSize: true,
        // The player then starts with that sound, without loading another first.
        ...(liked.audio ? { audioPreference: { lang: liked.audio } } : {}),
        ...sharing?.hlsConfig,
      });
      sharing?.bind(hls);
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
        const level = hls.levels[data.level];
        setPlayingHeight(level?.height ?? null);
        reports.current?.level(level?.height ?? null, level?.bitrate ?? null);
      });
      let audioChosen = false;
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        audioLanguages.current = data.audioTracks.map((track) => track.lang);
        setAudioTracks(
          data.audioTracks.map((track) => ({
            id: track.id,
            label: track.name || languageLabel(track.lang, `Track ${track.id + 1}`),
          })),
        );
        // Once per video: the language the profile likes, when the video has it.
        if (!audioChosen && data.audioTracks.length > 0) {
          audioChosen = true;
          const wanted = pickTrack(data.audioTracks, liked.audio);
          // After the player made its own first choice, which comes right after this.
          window.setTimeout(() => {
            if (hlsRef.current !== hls) {
              return;
            }
            if (wanted !== -1 && wanted !== hls.audioTrack) {
              hls.audioTrack = wanted;
            }
            setAudioTrack(wanted !== -1 ? wanted : hls.audioTrack);
          }, 0);
        }
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => setAudioTrack(data.id));
      let subtitlesChosen = false;
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        textLanguages.current = data.subtitleTracks.map((track) => track.lang);
        setTextTracks(
          data.subtitleTracks.map((track) => ({
            id: track.id,
            label: track.name || languageLabel(track.lang, `Track ${track.id + 1}`),
          })),
        );
        if (!subtitlesChosen && data.subtitleTracks.length > 0) {
          subtitlesChosen = true;
          const wanted = pickTrack(data.subtitleTracks, liked.subtitles);
          if (wanted !== -1) {
            window.setTimeout(() => {
              if (hlsRef.current === hls) {
                hls.subtitleDisplay = true;
                hls.subtitleTrack = wanted;
              }
            }, 0);
          }
        }
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
              reports.current?.fail(
                errorCodeOf(data),
                `${errorWordsOf(data)}, ${failedLoads} times in a row`,
                element.currentTime,
              );
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
          reports.current?.recoveredError();
          hls.recoverMediaError();
          return;
        }
        reports.current?.fail(errorCodeOf(data), errorWordsOf(data), element.currentTime);
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
        sharingRef.current = null;
        hls.destroy();
        sharing?.destroy();
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
      const onError = () => {
        // 3 is a picture the device could not decode, 4 a video it cannot play at all.
        const code = element.error?.code;
        reports.current?.fail(
          code === 3 ? 'media' : code === 4 ? 'unsupported' : 'network',
          element.error?.message || undefined,
          element.currentTime,
        );
        callbacks.current.onFatal('The video could not be loaded. Check your connection.', true);
      };
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

    reports.current?.fail('unsupported', 'no way to play HLS in this browser');
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

  // --- What the device is set to --------------------------------------------

  // A data saver holds the ladder down without taking the choice of quality
  // away: picking a rung by hand still works, and still wins.
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) {
      return;
    }
    const cap = heightCap(settings.dataSaver);
    hls.autoLevelCapping =
      cap === null
        ? -1
        : hls.levels.reduce(
            (best, level, index) => (level.height <= cap && level.height > 0 ? index : best),
            -1,
          );
  }, [settings.dataSaver, qualities]);

  // Subtitles are drawn by the browser from the cues of the track that shows.
  // How they look is CSS; when they show and where they sit is on the cues
  // themselves, so every showing cue is gone over whenever a setting changes.
  const cues = useRef(createCueAdjuster());
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return undefined;
    }
    const apply = () => {
      for (const track of element.textTracks) {
        if (track.mode === 'showing') {
          cues.current.apply(
            [...(track.cues ?? [])] as unknown as Parameters<typeof cues.current.apply>[0],
            settings.subtitles,
          );
        }
      }
    };
    apply();
    // Cues of a track arrive part by part as the video plays, and each new
    // one has to be placed like the rest.
    const tracks = element.textTracks;
    tracks.addEventListener('change', apply);
    const timer = window.setInterval(apply, 2000);
    return () => {
      tracks.removeEventListener('change', apply);
      window.clearInterval(timer);
    };
  }, [settings.subtitles, textTrack]);

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
      // A jump counts from the moment it is asked for: if the video cannot be
      // loaded there, another server goes on from the new place and not the old.
      ['seeking', onTimeUpdate],
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
      [
        'ended',
        () => {
          // A break after the video comes before whatever follows it.
          if (!adsRef.current.beforeEnd(() => callbacks.current.onEnded())) {
            callbacks.current.onEnded();
          }
        },
      ],
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

  const rememberRef = useRef(remember);
  rememberRef.current = remember;

  const chooseAudioTrack = useCallback(
    (id: number) => {
      const hls = hlsRef.current;
      if (!hls) {
        return;
      }
      setAudioTrack(id);
      hls.audioTrack = id;
      const language = audioLanguages.current[id];
      if (language) {
        remember({ audioLanguage: language });
      }
    },
    [remember],
  );

  const chooseTextTrack = useCallback((id: number) => {
    setTextTrack(id);
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleDisplay = id !== NONE;
      hls.subtitleTrack = id;
      // "Off" is remembered too. A track without a language cannot be.
      const language = id === NONE ? null : textLanguages.current[id];
      if (language !== undefined) {
        rememberRef.current({ subtitleLanguage: language });
      }
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
    const element = video.current;
    if (element) {
      element.playbackRate = SPEEDS[index] ?? 1;
      // Without this the sound of a fast picture turns into chipmunks.
      element.preservesPitch = true;
    }
  }, []);

  /** One speed up or down the list, for the < and > keys. */
  const stepRate = useCallback((direction: number) => {
    const element = video.current;
    if (!element) {
      return;
    }
    const at = SPEEDS.indexOf(element.playbackRate);
    const next = Math.min(
      SPEEDS.length - 1,
      Math.max(0, (at === -1 ? SPEEDS.indexOf(1) : at) + direction),
    );
    element.playbackRate = SPEEDS[next] ?? 1;
    element.preservesPitch = true;
  }, []);

  /**
   * One frame forward or back, for finding an exact moment. The video has to
   * be paused, and 25 frames a second is close enough for any of them.
   */
  const stepFrame = useCallback((direction: number) => {
    const element = video.current;
    if (element && !element.paused) {
      element.pause();
    }
    if (element) {
      element.currentTime = Math.max(0, element.currentTime + direction * 0.04);
    }
  }, []);

  /** The speed a finger resting on the picture runs it at. */
  const holdRate = useCallback((rate: number) => {
    const element = video.current;
    if (element) {
      element.playbackRate = rate;
      element.preservesPitch = true;
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

  // --- Skipping recap, intro and credits ------------------------------------

  // The stretch the video is in, while skipping it still saves something.
  const running = overlay ? null : runningMarker(playback.markers, time, duration);
  // Credits are skipped to what comes next. Without that, only credits
  // followed by a scene are worth a button.
  const skipAction =
    running === null
      ? null
      : running.kind === 'CREDITS' && afterCredits
        ? afterCredits
        : running.kind === 'CREDITS' && running.endMs === null
          ? null
          : {
              label: skipLabel(running.kind),
              onPress: () => {
                if (video.current) {
                  video.current.currentTime = endOf(running, duration);
                }
              },
            };
  const skipRef = useRef(skipAction);
  skipRef.current = skipAction;
  const skipRunning = useCallback(() => skipRef.current?.onPress(), []);

  // Skipping without being asked, for a viewer who never wants to see an
  // opening again. Credits are only skipped when something follows them;
  // otherwise the end screen has its say.
  const wantsSkipped =
    running !== null &&
    (settings.autoSkip === 'all' || (settings.autoSkip === 'intro' && running.kind !== 'CREDITS'));
  /** The stretches already skipped by themselves, so none is skipped twice. */
  const autoSkipped = useRef(new Set<string>());
  useEffect(() => {
    autoSkipped.current = new Set();
  }, [playback.manifestUrl]);
  useEffect(() => {
    if (!wantsSkipped || !running || !skipRef.current) {
      return;
    }
    // A viewer who goes back into a stretch on purpose is not thrown out of
    // it again, so each stretch is passed over only the first time.
    const mark = `${running.kind}:${running.startMs}`;
    if (autoSkipped.current.has(mark)) {
      return;
    }
    autoSkipped.current.add(mark);
    skipRef.current.onPress();
  }, [wantsSkipped, running, playback.manifestUrl]);

  // --- The sleep timer ------------------------------------------------------

  const chooseSleep = useCallback((minutes: number) => {
    setSleepChoice(minutes);
    setSleptOff(false);
    setSleepAt(minutes > 0 ? Date.now() + minutes * 60_000 : null);
  }, []);

  useEffect(() => {
    if (sleepAt === null) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (Date.now() < sleepAt) {
        return;
      }
      video.current?.pause();
      setSleepAt(null);
      setSleepChoice(0);
      setSleptOff(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepAt]);

  // "At the end of this" needs no clock. It is the page above that has to
  // know, so that it does not start the next episode by itself.
  useEffect(() => {
    callbacks.current.onStopAtEnd?.(sleepChoice === -1);
  }, [sleepChoice]);

  // --- Keys -----------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isOwnedByControl(event)) {
        return;
      }
      // While an ad plays, the film cannot be reached. Full screen still works.
      if (adsRef.current.active && event.key.toLowerCase() !== 'f') {
        return;
      }
      const element = video.current;
      const step = settings.seekStep;
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => skip(-step),
        ArrowRight: () => skip(step),
        j: () => skip(-step),
        l: () => skip(step),
        ',': () => stepFrame(-1),
        '.': () => stepFrame(1),
        ArrowUp: () => changeVolume((element?.volume ?? 1) + 0.1),
        ArrowDown: () => changeVolume((element?.volume ?? 1) - 0.1),
        Home: () => seekTo(0),
        End: () => seekTo((element?.duration ?? 0) - 1),
        m: toggleMute,
        f: toggleFullscreen,
        s: skipRunning,
        i: pip.toggle,
        d: () => setStatsOpen((open) => !open),
        '?': () => setShortcutsOpen(true),
        '<': () => stepRate(-1),
        '>': () => stepRate(1),
        c: () => {
          if (textTracks.length > 0) {
            chooseTextTrack(textTrack === NONE ? (textTracks[0]?.id ?? NONE) : NONE);
          }
        },
        v: () => {
          // Round the picture through the ways it can fill the window.
          const next = FIT_ORDER[(FIT_ORDER.indexOf(settings.fit) + 1) % FIT_ORDER.length];
          setPlayerSettings({ fit: next ?? 'fit' });
        },
      };
      // A number jumps to that tenth of the video, as every player does.
      if (/^[0-9]$/.test(event.key) && Number.isFinite(element?.duration)) {
        event.preventDefault();
        seekTo(((element?.duration ?? 0) * Number(event.key)) / 10);
        wake();
        return;
      }
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
    seekTo,
    stepFrame,
    stepRate,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    chooseTextTrack,
    textTrack,
    textTracks,
    pip.toggle,
    settings.seekStep,
    settings.fit,
    wake,
  ]);

  // --- Tapping the picture ---------------------------------------------------

  // A finger first brings the controls back. A second tap puts them away.
  const onSurfaceTapped = useCallback(() => {
    if (controlsShown && !pinned) {
      window.clearTimeout(hideTimer.current);
      setControlsShown(false);
    } else {
      wake();
    }
  }, [controlsShown, pinned, wake]);

  const look = settings.subtitles;
  const settingsList = useMemo<Setting[]>(
    () => [
      {
        kind: 'choice',
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
        kind: 'choice',
        name: 'Sound',
        selected: audioTrack,
        onChoose: chooseAudioTrack,
        choices: audioTracks.map((track) => ({ value: track.id, label: track.label })),
      },
      {
        kind: 'choice',
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
        kind: 'choice',
        name: 'Speed',
        selected: Math.max(0, SPEEDS.indexOf(rate)),
        onChoose: chooseRate,
        choices: SPEEDS.map((speed, index) => ({
          value: index,
          label: speed === 1 ? 'Normal' : `${speed}×`,
        })),
      },
      {
        kind: 'page',
        name: 'How subtitles look',
        summary: `${Math.round((look.size / 4.2) * 100)}%`,
        items: [
          {
            kind: 'range',
            name: 'Size',
            min: 2.4,
            max: 9,
            step: 0.2,
            value: look.size,
            format: (value) => `${Math.round((value / 4.2) * 100)}%`,
            onChange: (size) => setSubtitleLook({ size }),
          },
          {
            kind: 'choice',
            name: 'Colour',
            selected: Math.max(
              0,
              SUBTITLE_COLORS.findIndex((entry) => entry.value === look.color),
            ),
            onChoose: (index) =>
              setSubtitleLook({
                color: SUBTITLE_COLORS[index]?.value ?? DEFAULT_SETTINGS.subtitles.color,
              }),
            choices: SUBTITLE_COLORS.map((entry, index) => ({
              value: index,
              label: entry.label,
            })),
          },
          {
            kind: 'choice',
            name: 'Set off from the picture',
            selected: ['none', 'outline', 'shadow', 'box'].indexOf(look.edge),
            onChoose: (index) =>
              setSubtitleLook({
                edge: (['none', 'outline', 'shadow', 'box'] as const)[index] ?? 'shadow',
              }),
            choices: [
              { value: 0, label: 'Nothing' },
              { value: 1, label: 'An outline' },
              { value: 2, label: 'A shadow' },
              { value: 3, label: 'A band behind' },
            ],
          },
          {
            kind: 'range',
            name: 'Height on the picture',
            min: 2,
            max: 40,
            step: 1,
            value: look.bottom,
            format: (value) => `${value}%`,
            onChange: (bottom) => setSubtitleLook({ bottom }),
          },
          {
            kind: 'range',
            name: 'Timing',
            min: -10,
            max: 10,
            step: 0.25,
            value: look.offset,
            format: (value) => (value === 0 ? 'As written' : `${value > 0 ? '+' : ''}${value} s`),
            onChange: (offset) => setSubtitleLook({ offset }),
            onReset: () => setSubtitleLook({ offset: 0 }),
          },
        ],
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
            name: 'Louder than the recording',
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
        kind: 'page',
        name: 'Playing',
        summary:
          settings.dataSaver === 'off'
            ? (AUTO_SKIP_CHOICES.find((entry) => entry.value === settings.autoSkip)?.label ?? '')
            : `Up to ${settings.dataSaver}p`,
        items: [
          {
            kind: 'choice',
            name: 'Skip openings and credits',
            selected: AUTO_SKIP_CHOICES.findIndex((entry) => entry.value === settings.autoSkip),
            onChoose: (index) =>
              setPlayerSettings({
                autoSkip: AUTO_SKIP_CHOICES[index]?.value ?? 'off',
              }),
            choices: AUTO_SKIP_CHOICES.map((entry, index) => ({
              value: index,
              label: entry.label,
            })),
          },
          {
            kind: 'choice',
            name: 'Most it may use',
            selected: SAVER_CHOICES.findIndex((entry) => entry.value === settings.dataSaver),
            onChoose: (index) =>
              setPlayerSettings({
                dataSaver: SAVER_CHOICES[index]?.value ?? 'off',
              }),
            choices: SAVER_CHOICES.map((entry, index) => ({ value: index, label: entry.label })),
          },
          {
            kind: 'choice',
            name: 'A skip moves',
            selected: SEEK_STEPS.indexOf(settings.seekStep as never),
            onChoose: (index) =>
              setPlayerSettings({ seekStep: SEEK_STEPS[index] ?? SEEK_STEPS[1] }),
            choices: SEEK_STEPS.map((seconds, index) => ({
              value: index,
              label: `${seconds} seconds`,
            })),
          },
          {
            kind: 'choice',
            name: 'Stop playing',
            selected: sleepChoice,
            onChoose: chooseSleep,
            choices: SLEEP_CHOICES,
          },
          {
            kind: 'switch',
            name: 'Show the figures',
            on: statsOpen,
            onChange: (on) => {
              setStatsOpen(on);
              setPlayerSettings({ stats: on });
            },
            note: 'What the picture, the line and the servers are doing.',
          },
        ],
      },
      {
        kind: 'choice',
        name: 'Share with viewers',
        selected: sharingOn ? 1 : 0,
        onChoose: chooseSharing,
        choices: canShareThis
          ? [
              { value: 1, label: 'On' },
              { value: 0, label: 'Off' },
            ]
          : [],
        note: describeSharing(shared, sharingOn),
      },
    ],
    [
      sharingOn,
      shared,
      canShareThis,
      chooseSharing,
      quality,
      qualities,
      playingHeight,
      textTrack,
      textTracks,
      audioTrack,
      audioTracks,
      rate,
      chooseQuality,
      chooseTextTrack,
      chooseAudioTrack,
      chooseRate,
      look,
      settings.fit,
      settings.boost,
      settings.nightMode,
      settings.autoSkip,
      settings.dataSaver,
      settings.seekStep,
      brightness,
      sleepChoice,
      chooseSleep,
      statsOpen,
    ],
  );

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: ['Space', 'K'], what: 'Play and pause' },
      { keys: ['←', '→'], what: `Skip ${settings.seekStep} seconds` },
      { keys: [',', '.'], what: 'One frame back and forward' },
      { keys: ['↑', '↓'], what: 'Volume' },
      { keys: ['0', '…', '9'], what: 'Jump to that tenth' },
      { keys: ['Home', 'End'], what: 'The beginning and the end' },
      { keys: ['<', '>'], what: 'Slower and faster' },
      { keys: ['M'], what: 'Mute' },
      { keys: ['C'], what: 'Subtitles on and off' },
      { keys: ['S'], what: 'Skip the opening or the credits' },
      { keys: ['V'], what: 'How the picture fills the window' },
      { keys: ['F'], what: 'Full screen' },
      { keys: ['I'], what: 'The small floating window' },
      { keys: ['D'], what: 'The figures behind the playback' },
      { keys: ['?'], what: 'This list' },
    ],
    [settings.seekStep],
  );

  const stats = usePlaybackStats(video, hlsRef, statsOpen, false);
  const picture = fitStyle(settings.fit);
  const bands = useMemo(
    () => markerBands(playback.markers, duration),
    [playback.markers, duration],
  );

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const shownVolume = muted ? 0 : volume;

  return (
    <div
      ref={container}
      style={subtitleProperties(look, pictureHeight)}
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
        style={{
          objectFit: picture.objectFit,
          transform: picture.scale === 1 ? undefined : `scale(${picture.scale})`,
          filter: brightnessFilter(brightness),
        }}
        className="absolute inset-0 size-full transition-[transform,filter] duration-200"
      />

      {/* The picture itself, as something to click, tap, hold and drag. */}
      <TouchSurface
        step={settings.seekStep}
        holdRate={HOLD_RATE}
        volume={muted ? 0 : volume}
        brightness={brightness}
        onSkip={skip}
        onTogglePlay={togglePlay}
        onToggleFullscreen={toggleFullscreen}
        onVolume={changeVolume}
        onBrightness={setBrightness}
        onRate={holdRate}
        onWake={wake}
        onTap={onSurfaceTapped}
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

      {skipAction ? (
        <button
          type="button"
          className="button absolute right-[clamp(0.75rem,3vw,2.5rem)] bottom-[clamp(6rem,14vh,8.5rem)] z-10 border border-vein/70 bg-onyx/75 text-vein backdrop-blur-sm hover:bg-vein hover:text-onyx"
          onClick={() => {
            skipAction.onPress();
            wake();
          }}
        >
          <SkipForward className="fill-current" />
          {skipAction.label}
        </button>
      ) : null}

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
          bands={bands}
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
            aria-label={`Back ${settings.seekStep} seconds`}
            className="player-button"
            onClick={() => skip(-settings.seekStep)}
          >
            <RotateCcw />
          </button>
          <button
            type="button"
            aria-label={`Forward ${settings.seekStep} seconds`}
            className="player-button"
            onClick={() => skip(settings.seekStep)}
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

          {settings.nightMode || settings.boost > 1 ? (
            <span
              title="Night mode"
              className="ml-2 hidden items-center gap-1.5 text-xs text-smoke sm:flex"
            >
              <Moon className="size-3.5" aria-hidden="true" />
              {settings.boost > 1 ? `${Math.round(settings.boost * 100)}%` : 'Night'}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            {remote.available ? (
              <button
                type="button"
                aria-label={
                  remote.connected ? 'Playing on another device' : 'Play on another device'
                }
                aria-pressed={remote.connected}
                className={`player-button ${remote.connected ? 'text-sard' : ''}`}
                onClick={remote.prompt}
              >
                <Cast />
              </button>
            ) : null}
            {pip.supported ? (
              <button
                type="button"
                aria-label={pip.active ? 'Back into the page' : 'Play in a small window'}
                aria-pressed={pip.active}
                className={`player-button ${pip.active ? 'text-sard' : ''}`}
                onClick={pip.toggle}
              >
                <PictureInPicture2 />
              </button>
            ) : null}
            <SettingsMenu open={menuOpen} onOpenChange={setMenuOpen} settings={settingsList} />
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

      {statsOpen ? (
        <StatsPanel
          reading={stats}
          sharing={canShareThis ? { on: sharingOn, figures: shared } : null}
          onClose={() => {
            setStatsOpen(false);
            setPlayerSettings({ stats: false });
          }}
        />
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsSheet shortcuts={shortcuts} onClose={() => setShortcutsOpen(false)} />
      ) : null}

      {sleptOff ? (
        <div role="status" className="absolute inset-x-0 top-20 flex justify-center px-4">
          <p className="flex items-center gap-3 border border-line bg-coal/95 px-4 py-2 text-sm backdrop-blur-sm">
            <Moon className="size-4 text-sard" aria-hidden="true" />
            Stopped by the sleep timer.
            <button
              type="button"
              className="text-sard underline underline-offset-2"
              onClick={() => {
                setSleptOff(false);
                togglePlay();
              }}
            >
              Keep watching
            </button>
          </p>
        </div>
      ) : null}

      {ads.active ? <AdLayer active={ads.active} audio={readVolume()} onClose={ads.close} /> : null}
    </div>
  );
}
