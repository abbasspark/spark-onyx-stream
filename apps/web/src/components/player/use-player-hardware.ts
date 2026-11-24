// SPDX-License-Identifier: AGPL-3.0-only
'use client';

// What the device itself offers a player: a small window that floats over
// other work, a television in the room to send the picture to, and the sound
// card, which can do more than the video element asks of it.

import { type RefObject, useCallback, useEffect, useState } from 'react';

interface PictureInPicture {
  /** Whether this browser has it at all. */
  supported: boolean;
  active: boolean;
  toggle: () => void;
}

type PipVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
  disablePictureInPicture?: boolean;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
};

/**
 * The small window that keeps playing over other windows.
 *
 * Chrome and Firefox have the standard call. Safari has its own, under
 * "presentation mode", which does the same thing.
 */
export function usePictureInPicture(video: RefObject<HTMLVideoElement | null>): PictureInPicture {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = video.current as PipVideo | null;
    if (!element) {
      return undefined;
    }
    setSupported(
      (document.pictureInPictureEnabled === true && element.disablePictureInPicture !== true) ||
        element.webkitSupportsPresentationMode?.('picture-in-picture') === true,
    );
    const onEnter = () => setActive(true);
    const onLeave = () => setActive(false);
    // Safari says nothing but that the mode changed; the element knows which.
    const onPresentation = () =>
      setActive(
        (element as unknown as { webkitPresentationMode?: string }).webkitPresentationMode ===
          'picture-in-picture',
      );
    element.addEventListener('enterpictureinpicture', onEnter);
    element.addEventListener('leavepictureinpicture', onLeave);
    element.addEventListener('webkitpresentationmodechanged', onPresentation);
    return () => {
      element.removeEventListener('enterpictureinpicture', onEnter);
      element.removeEventListener('leavepictureinpicture', onLeave);
      element.removeEventListener('webkitpresentationmodechanged', onPresentation);
    };
  }, [video]);

  const toggle = useCallback(() => {
    const element = video.current as PipVideo | null;
    if (!element) {
      return;
    }
    if (element.webkitSetPresentationMode) {
      element.webkitSetPresentationMode(active ? 'inline' : 'picture-in-picture');
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    // The browser refuses when the video has no picture yet. Nothing is lost.
    void element.requestPictureInPicture?.().catch(() => undefined);
  }, [video, active]);

  return { supported, active, toggle };
}

interface RemotePlayback {
  /** Whether a television or a speaker was found to send the picture to. */
  available: boolean;
  connected: boolean;
  prompt: () => void;
}

type RemoteVideo = HTMLVideoElement & {
  remote?: {
    state: 'connected' | 'connecting' | 'disconnected';
    watchAvailability: (callback: (available: boolean) => void) => Promise<number>;
    cancelWatchAvailability: (id?: number) => Promise<void>;
    prompt: () => Promise<void>;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
  webkitShowPlaybackTargetPicker?: () => void;
};

/**
 * Sending the picture to a television: AirPlay on Safari, the cast devices
 * the browser knows about elsewhere.
 *
 * The button only appears once a device has answered, so that it is never
 * offered where pressing it would find nothing.
 */
export function useRemotePlayback(video: RefObject<HTMLVideoElement | null>): RemotePlayback {
  const [available, setAvailable] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const element = video.current as RemoteVideo | null;
    const remote = element?.remote;
    if (!element) {
      return undefined;
    }
    // Safari without the Remote Playback API still has AirPlay, and says so
    // with an event of its own.
    const onAirplay = (event: Event) =>
      setAvailable((event as Event & { availability?: string }).availability === 'available');
    element.addEventListener('webkitplaybacktargetavailabilitychanged', onAirplay);

    if (!remote) {
      return () =>
        element.removeEventListener('webkitplaybacktargetavailabilitychanged', onAirplay);
    }
    let watch: number | undefined;
    const onState = () => setConnected(remote.state === 'connected');
    remote.addEventListener('connect', onState);
    remote.addEventListener('connecting', onState);
    remote.addEventListener('disconnect', onState);
    remote
      .watchAvailability((found) => setAvailable(found))
      .then((id) => {
        watch = id;
      })
      // A browser may refuse to watch, which only means no button.
      .catch(() => undefined);
    return () => {
      element.removeEventListener('webkitplaybacktargetavailabilitychanged', onAirplay);
      remote.removeEventListener('connect', onState);
      remote.removeEventListener('connecting', onState);
      remote.removeEventListener('disconnect', onState);
      if (watch !== undefined) {
        void remote.cancelWatchAvailability(watch).catch(() => undefined);
      }
    };
  }, [video]);

  const prompt = useCallback(() => {
    const element = video.current as RemoteVideo | null;
    if (element?.remote) {
      void element.remote.prompt().catch(() => undefined);
      return;
    }
    element?.webkitShowPlaybackTargetPicker?.();
  }, [video]);

  return { available, connected, prompt };
}

interface Chain {
  context: AudioContext;
  gain: GainNode;
  squeeze: DynamicsCompressorNode;
  source: MediaElementAudioSourceNode;
}

/**
 * A video can be taken into Web Audio only once, and taking it in cannot be
 * undone: closing the context would leave it silent. So the chain a video
 * gets is built at most once and kept, and switching the extra sound off
 * means running the chain flat, not taking it apart.
 */
const chains = new WeakMap<HTMLVideoElement, Chain | null>();

function chainFor(element: HTMLVideoElement): Chain | null {
  const existing = chains.get(element);
  if (existing !== undefined) {
    return existing;
  }
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) {
    chains.set(element, null);
    return null;
  }
  try {
    const context = new Context();
    const source = context.createMediaElementSource(element);
    const squeeze = context.createDynamicsCompressor();
    const gain = context.createGain();
    source.connect(squeeze);
    squeeze.connect(gain);
    gain.connect(context.destination);
    const chain = { context, source, squeeze, gain };
    chains.set(element, chain);
    return chain;
  } catch {
    // A stream from another site cannot be taken in at all. The sound then
    // stays as the video element plays it.
    chains.set(element, null);
    return null;
  }
}

/**
 * Sound beyond what the video element can do on its own: louder than the
 * recording, and a night mode that pulls the loud parts down so that quiet
 * speech can be heard without the next explosion waking the house.
 *
 * Nothing is built until one of the two is asked for, because routing a
 * video through Web Audio costs a little and, on some browsers, stops the
 * picture being sent to a television.
 */
export function useAudioChain(
  video: RefObject<HTMLVideoElement | null>,
  boost: number,
  nightMode: boolean,
  /** No chain while the picture and the sound are on another device. */
  disabled: boolean,
): void {
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    const wanted = boost > 1 || nightMode;
    // Built on the first video that wants it, and used flat ever after.
    const chain = wanted && !disabled ? chainFor(element) : (chains.get(element) ?? null);
    if (!chain) {
      return;
    }
    const level = wanted && !disabled ? boost : 1;
    const { squeeze, gain, context } = chain;
    gain.gain.setTargetAtTime(level, context.currentTime, 0.05);
    if (nightMode && !disabled) {
      // Everything above a quiet level is pulled towards it, so that the
      // difference between a whisper and a bang is much smaller.
      squeeze.threshold.value = -34;
      squeeze.knee.value = 18;
      squeeze.ratio.value = 10;
      squeeze.attack.value = 0.004;
      squeeze.release.value = 0.22;
    } else {
      // Not off, but barely there: it catches what a boost would clip.
      squeeze.threshold.value = -2;
      squeeze.knee.value = 6;
      squeeze.ratio.value = 2;
      squeeze.attack.value = 0.003;
      squeeze.release.value = 0.25;
    }
    // A browser holds a new context silent until the viewer has clicked.
    void context.resume().catch(() => undefined);
  }, [video, boost, nightMode, disabled]);
}

/**
 * The height of an element in pixels, kept up to date. The player needs it to
 * size subtitles against the picture instead of the window.
 */
export function useElementHeight(element: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const box = element.current;
    if (!box || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    setHeight(box.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry?.contentRect.height ?? box.clientHeight);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [element]);

  return height;
}
