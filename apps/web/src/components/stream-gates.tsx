// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Loader2, MonitorPlay, MonitorSmartphone, Smartphone, Tablet, Tv } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  describePlaying,
  describeStreamDevice,
  devicesPhrase,
  holdStream,
  type PlayingStream,
  type StreamLimitRefusal,
  streamsApi,
  type StreamTicket,
} from '@/lib/streams';

const DEVICE_ICONS = {
  DESKTOP: MonitorPlay,
  MOBILE: Smartphone,
  TABLET: Tablet,
  TV: Tv,
  OTHER: MonitorSmartphone,
} as const;

/**
 * Holds the place of this device among the streams of the account while a
 * player is on the page.
 *
 * @returns True once the place was taken away: the player has to stop.
 */
export function useStreamPlace(
  ticket: StreamTicket | null | undefined,
  /** Asks for playback again, after the browser brought back a page that had been left. */
  onReturned: () => void,
): boolean {
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const id = ticket?.id ?? null;
  const beatSeconds = ticket?.beatSeconds ?? 30;
  const returned = useRef(onReturned);
  useEffect(() => {
    returned.current = onReturned;
  }, [onReturned]);
  useEffect(() => {
    if (!id) {
      return undefined;
    }
    return holdStream(
      { id, beatSeconds },
      { onStopped: () => setStoppedId(id), onReturned: () => returned.current() },
    );
  }, [id, beatSeconds]);
  return id !== null && stoppedId === id;
}

interface StreamLimitGateProps {
  refusal: StreamLimitRefusal;
  /** What the viewer wanted to watch. */
  heading: string;
  /** Asks for playback again. */
  onRetry: () => void;
}

/**
 * Shown instead of the player when the account plays on as many devices as
 * it may. Says where, and lets the viewer stop one of them to watch here.
 */
export function StreamLimitGate({ refusal, heading, onRetry }: StreamLimitGateProps) {
  const [stopping, setStopping] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  async function stopThere(stream: PlayingStream) {
    setStopping(stream.id);
    setProblem(false);
    if (await streamsApi.stop(stream.id)) {
      onRetry();
      return;
    }
    setStopping(null);
    setProblem(true);
  }

  return (
    <>
      <MonitorSmartphone className="size-8 text-sard" aria-hidden="true" />
      <h1 className="display max-w-xl text-3xl sm:text-4xl">
        Your account is playing {devicesPhrase(refusal.limit)} already
      </h1>
      <p className="max-w-md text-smoke">
        That is as many as it can at the same time. Stop one of them to watch {heading} here.
      </p>
      <ul className="w-full max-w-xl divide-y divide-line border border-line text-left">
        {refusal.streams.map((stream) => {
          const Icon = DEVICE_ICONS[stream.device] ?? MonitorSmartphone;
          return (
            <li key={stream.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
              <Icon className="size-6 shrink-0 text-smoke" aria-hidden="true" />
              {/* Wide enough to be read: on a phone the button goes under it. */}
              <div className="min-w-[min(100%,11rem)] flex-1">
                <p className="truncate font-medium">{describePlaying(stream)}</p>
                <p className="truncate text-sm text-smoke">
                  {describeStreamDevice(stream)}
                  {stream.profile ? `, ${stream.profile.name}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="button button-quiet max-sm:w-full"
                disabled={stopping !== null}
                aria-busy={stopping === stream.id}
                onClick={() => void stopThere(stream)}
              >
                {stopping === stream.id ? (
                  <Loader2
                    className="animate-[player-spin_0.9s_linear_infinite]"
                    aria-hidden="true"
                  />
                ) : null}
                Stop there, play here
              </button>
            </li>
          );
        })}
      </ul>
      {problem ? (
        <p role="alert" className="max-w-md text-alarm">
          That device could not be stopped. Try again in a moment.
        </p>
      ) : null}
      <button
        type="button"
        className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
        onClick={onRetry}
      >
        I stopped one myself, try again
      </button>
    </>
  );
}

/** Shown when the place of this device was taken away while it was playing. */
export function StreamStoppedGate({ heading, onRetry }: { heading: string; onRetry: () => void }) {
  return (
    <>
      <MonitorSmartphone className="size-8 text-sard" aria-hidden="true" />
      <h1 className="display max-w-xl text-3xl sm:text-4xl">Playback stopped on this device</h1>
      <p role="status" className="max-w-md text-smoke">
        Your account started playing somewhere else, and it was at its limit of devices. {heading}{' '}
        is kept where you were.
      </p>
      <button type="button" className="button button-play" onClick={onRetry}>
        Play here again
      </button>
    </>
  );
}
