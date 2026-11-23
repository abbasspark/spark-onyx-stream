// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { BeatMeter, sendBeat } from '@/lib/beats';
import { loadSharing } from '@/lib/p2p';
import { MAX_FAILOVERS, otherServerOf, withAvoid } from '@/lib/delivery';
import { Loader2, Lock, Mail, Play, RotateCcw, SkipForward } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import { findEntry, isResumable } from '@/lib/progress';
import { recordFinished, recordPosition, syncSettled } from '@/lib/watch-sync';
import type { Playback } from '@/lib/types';
import { authHref, ViewerApiError, viewerApi } from '@/lib/viewer-api';
import { Player } from './player/player';
import { useViewerSession } from './viewer-session';

const SAVE_EVERY_MS = 5000;
const NEXT_AFTER_SECONDS = 8;
const RESUME_NOTE_MS = 9000;

export interface WatchScreenProps {
  /** Address that hands out the signed playback addresses. */
  playbackPath: string;
  /** Name of the movie or the series. */
  heading: string;
  /** For an episode "S1 E3 The Trench", for a trailer "Trailer". */
  detail: string | null;
  backHref: string;
  /**
   * Under which the position is remembered, with what the "Continue watching"
   * row shows. Null for a trailer, which is not worth resuming.
   */
  progress: { id: string; key: string; href: string; image: string | null } | null;
  /** What plays after this, for an episode that has a following one. */
  next: { href: string; label: string } | null;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; playback: Playback; startAt: number }
  | { state: 'failed'; message: string; retry: boolean }
  /** Playback needs a signed-in viewer and there is none. */
  | { state: 'sign-in' }
  /** Playback needs a confirmed email address and the viewer has yet to confirm. */
  | { state: 'confirm-email' }
  /** The title needs a subscription and the viewer has none. */
  | { state: 'subscribe' }
  /** Subscribed, to a plan that does not open this title. */
  | { state: 'other-plan' }
  /** A title no plan opens: it is rented or bought. */
  | { state: 'purchase' };

/** Explains a refused playback request in the viewer's terms. */
function refusal(status: number): { message: string; retry: boolean } {
  switch (status) {
    case 403:
      return { message: 'Playback is not open on this site at the moment.', retry: false };
    case 404:
    case 409:
      return { message: 'This video is no longer available.', retry: false };
    case 429:
      return { message: 'Too many requests at once. Wait a moment and try again.', retry: true };
    default:
      return { message: 'The video could not be started. Try again in a moment.', retry: true };
  }
}

/**
 * Everything around the player on a watch page: it asks for the playback
 * addresses, remembers where the viewer is, and decides what comes after.
 */
export function WatchScreen({
  playbackPath,
  heading,
  detail,
  backHref,
  progress,
  next,
}: WatchScreenProps) {
  const router = useRouter();
  const { state: sessionState, viewer, profile, access } = useViewerSession();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [restartSignal, setRestartSignal] = useState(0);
  const position = useRef({ time: 0, duration: 0, savedAt: 0 });

  // --- Asking for the addresses --------------------------------------------

  useEffect(() => {
    // Asking before it is known who is signed in would mean asking twice,
    // and starting the video twice.
    if (sessionState !== 'ready') {
      return;
    }
    const controller = new AbortController();
    setLoaded({ state: 'loading' });
    setEnded(false);

    // After a failure the video goes on where it broke, otherwise where the
    // viewer left it, on this device or on another one.
    const whereToStart = async (): Promise<number> => {
      if (attempt > 0) {
        return position.current.time;
      }
      if (!progress) {
        return 0;
      }
      await syncSettled();
      const stored = findEntry(progress.key);
      return stored && isResumable(stored.position, stored.duration) ? stored.position : 0;
    };

    Promise.all([
      fetch(withAvoid(playbackPath, avoid.current), { method: 'POST', signal: controller.signal }),
      whereToStart(),
    ])
      .then(async ([response, startAt]) => {
        if (controller.signal.aborted) {
          return;
        }
        if (response.status === 401) {
          setLoaded({ state: 'sign-in' });
          return;
        }
        if (response.status === 402) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null;
          setLoaded({
            state:
              body?.code === 'plan_required'
                ? 'other-plan'
                : body?.code === 'purchase_required'
                  ? 'purchase'
                  : 'subscribe',
          });
          return;
        }
        if (response.status === 403) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null;
          if (body?.code === 'email_unverified') {
            setLoaded({ state: 'confirm-email' });
            return;
          }
        }
        if (!response.ok) {
          setLoaded({ state: 'failed', ...refusal(response.status) });
          return;
        }
        const playback = (await response.json()) as Playback;
        if (playback.p2p) {
          await loadSharing();
        }
        if (controller.signal.aborted) {
          return;
        }
        setLoaded({ state: 'ready', playback, startAt });
        if (attempt === 0 && startAt > 0) {
          setResumedAt(startAt);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoaded({
            state: 'failed',
            message: 'The site could not be reached. Check your connection.',
            retry: true,
          });
        }
      });
    return () => controller.abort();
    // The progress key belongs to the page and does not change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Signing in, or out, in this or another tab asks again.
  }, [playbackPath, attempt, sessionState, viewer?.id, profile?.id]);

  useEffect(() => {
    if (resumedAt === null) {
      return;
    }
    const timer = window.setTimeout(() => setResumedAt(null), RESUME_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [resumedAt]);

  // --- Remembering the position --------------------------------------------

  const save = useCallback(
    (leaving = false) => {
      const { time, duration } = position.current;
      if (!progress || !(duration > 0)) {
        return;
      }
      position.current.savedAt = Date.now();
      recordPosition(
        {
          id: progress.id,
          key: progress.key,
          href: progress.href,
          name: heading,
          detail,
          image: progress.image,
          position: time,
          duration,
          updatedAt: Date.now(),
        },
        leaving,
      );
    },
    [progress, heading, detail],
  );

  // --- Telling the server what is watched -------------------------------------
  // For the figures in the panel: how long the video really played. Nothing
  // here is needed for watching, so nothing here may get in its way.

  const playId = loaded.state === 'ready' ? (loaded.playback.playId ?? null) : null;
  const meter = useRef(new BeatMeter());
  useEffect(() => {
    meter.current = new BeatMeter();
  }, [playId]);
  const report = useCallback(() => {
    const beat = playId ? meter.current.take() : null;
    if (playId && beat) {
      sendBeat(playId, beat);
    }
  }, [playId]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        report();
      }
    };
    window.addEventListener('pagehide', report);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', report);
      document.removeEventListener('visibilitychange', onHide);
      report();
    };
  }, [report]);

  const onTime = useCallback(
    (time: number, duration: number) => {
      meter.current.tick(time);
      if (meter.current.due) {
        report();
      }
      position.current.time = time;
      position.current.duration = duration;
      if (Date.now() - position.current.savedAt >= SAVE_EVERY_MS) {
        save();
      }
    },
    [save, report],
  );

  // Leaving the page, or putting the phone away, saves the exact position.
  useEffect(() => {
    // The page may be gone before the answer comes, so the request is one
    // the browser finishes by itself.
    const onLeave = () => save(true);
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        save(true);
      }
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onHide);
      save(true);
    };
  }, [save]);

  // --- The end --------------------------------------------------------------

  const onEnded = useCallback(() => {
    report();
    if (progress) {
      recordFinished(progress, position.current.duration);
    }
    // Nothing is saved any more: the position is the end, which is not worth resuming.
    position.current.duration = 0;
    setEnded(true);
    setCountdown(next ? NEXT_AFTER_SECONDS : null);
  }, [progress, next, report]);

  useEffect(() => {
    if (countdown === null || !next) {
      return;
    }
    if (countdown <= 0) {
      router.push(next.href);
      return;
    }
    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, next, router]);

  // A server that stopped answering is left for another one, a few times,
  // before the viewer is shown an error. The video goes on where it was.
  const avoid = useRef<string | null>(null);
  const failovers = useRef(0);
  const playingFrom = loaded.state === 'ready' ? loaded.playback.manifestUrl : null;
  const onFatal = useCallback(
    (message: string, network = false) => {
      if (network && playingFrom && failovers.current < MAX_FAILOVERS) {
        failovers.current += 1;
        avoid.current = otherServerOf(playingFrom, window.location.origin);
        setAttempt((value) => value + 1);
        return;
      }
      setLoaded({ state: 'failed', message, retry: true });
    },
    [playingFrom],
  );

  const watchAgain = () => {
    setEnded(false);
    setCountdown(null);
    setRestartSignal((value) => value + 1);
  };

  // --- Screens --------------------------------------------------------------

  if (loaded.state === 'sign-in') {
    const here = `${window.location.pathname}${window.location.search}`;
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
        <h1 className="display max-w-xl text-3xl sm:text-4xl">Sign in to watch {heading}</h1>
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
        <Link
          href={backHref}
          className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
        >
          Back to {heading}
        </Link>
      </div>
    );
  }

  if (loaded.state === 'purchase') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
        <Lock className="size-8 text-sard" aria-hidden="true" />
        <h1 className="display max-w-xl text-3xl sm:text-4xl">Rent or buy {heading}</h1>
        <p className="max-w-md text-smoke">
          This title is not part of a subscription. Its page shows what renting and buying cost.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={backHref} className="button button-play">
            See the ways to watch
          </Link>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw />I have it, play
          </button>
        </div>
      </div>
    );
  }

  if (loaded.state === 'other-plan') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
        <Lock className="size-8 text-sard" aria-hidden="true" />
        <h1 className="display max-w-xl text-3xl sm:text-4xl">{heading} is not in your plan</h1>
        <p className="max-w-md text-smoke">
          Your subscription opens other titles. The page of plans shows which plan includes this
          one. To change, cancel your plan on your account page and choose the other. The page of
          the title says whether it can be rented or bought instead.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/plans" className="button button-play">
            See the plans
          </Link>
          <Link href="/account" className="button button-quiet">
            Your account
          </Link>
        </div>
        <Link
          href={backHref}
          className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
        >
          All ways to watch {heading}
        </Link>
      </div>
    );
  }

  if (loaded.state === 'subscribe') {
    const here = typeof window === 'undefined' ? backHref : window.location.pathname;
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
        <Lock className="size-8 text-sard" aria-hidden="true" />
        <h1 className="display max-w-xl text-3xl sm:text-4xl">Subscribe to watch {heading}</h1>
        <p className="max-w-md text-smoke">
          This title is for subscribers. The page of the title says whether it can also be rented or
          bought on its own.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/plans?next=${encodeURIComponent(here)}`} className="button button-play">
            See the plans
          </Link>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw />I subscribed, play
          </button>
        </div>
        <Link
          href={backHref}
          className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
        >
          All ways to watch {heading}
        </Link>
      </div>
    );
  }

  if (loaded.state === 'confirm-email') {
    return (
      <ConfirmEmailGate
        heading={heading}
        backHref={backHref}
        email={viewer?.email ?? null}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (loaded.state !== 'ready') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
        {loaded.state === 'loading' ? (
          <div role="status">
            <Loader2 className="size-14 animate-[player-spin_0.9s_linear_infinite]" />
            <span className="sr-only">Loading the video</span>
          </div>
        ) : (
          <>
            <h1 className="display max-w-xl text-3xl">{loaded.message}</h1>
            <div className="flex flex-wrap justify-center gap-3">
              {loaded.retry ? (
                <button
                  type="button"
                  className="button button-play"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  <RotateCcw />
                  Try again
                </button>
              ) : null}
              <Link href={backHref} className="button button-quiet">
                Back to {heading}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const endScreen = ended ? (
    <div
      data-own-keys
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-7 bg-onyx/80 px-6 text-center"
    >
      {next ? (
        <>
          <div>
            <p className="text-smoke">
              {countdown !== null ? `Next episode in ${countdown}` : 'Next episode'}
            </p>
            <p className="display mt-2 text-3xl">{next.label}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={next.href} className="button button-play">
              <SkipForward className="fill-current" />
              Play now
            </Link>
            {countdown !== null ? (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setCountdown(null)}
              >
                Stay here
              </button>
            ) : (
              <Link href={backHref} className="button button-quiet">
                All episodes
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="display text-3xl">{heading}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={backHref} className="button button-play">
              Back to {progress ? 'the title' : heading}
            </Link>
            <button type="button" className="button button-quiet" onClick={watchAgain}>
              <Play className="fill-current" />
              Watch again
            </button>
          </div>
        </>
      )}
    </div>
  ) : resumedAt !== null ? (
    <div className="absolute bottom-28 left-[clamp(0.75rem,2.5vw,2rem)] z-10 flex items-center gap-3 border border-line bg-coal/95 py-1.5 pr-1.5 pl-4 text-sm">
      <span>Resumed at {formatClock(resumedAt)}</span>
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-vein/15 px-3 font-medium hover:bg-vein/25"
        onClick={() => {
          setResumedAt(null);
          setRestartSignal((value) => value + 1);
        }}
      >
        <RotateCcw className="size-4" />
        Start over
      </button>
    </div>
  ) : undefined;

  return (
    <Player
      key={`${playbackPath}:${attempt}`}
      playback={loaded.playback}
      heading={heading}
      detail={detail}
      backHref={backHref}
      startAt={loaded.startAt}
      restartSignal={restartSignal}
      onTime={onTime}
      onEnded={onEnded}
      onFatal={onFatal}
      overlay={endScreen}
    />
  );
}

/** Shown in place of the player while the viewer has yet to confirm their address. */
function ConfirmEmailGate({
  heading,
  backHref,
  email,
  onRetry,
}: {
  heading: string;
  backHref: string;
  email: string | null;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      await viewerApi.sendVerification();
      setNote({ tone: 'good', text: 'Sent. Check your inbox.' });
    } catch (caught) {
      // Confirmed in the meantime, for example on another device.
      if (caught instanceof ViewerApiError && caught.status === 409) {
        onRetry();
        return;
      }
      setNote({
        tone: 'bad',
        text:
          caught instanceof ViewerApiError
            ? caught.message
            : 'Something went wrong. Try again in a moment.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-onyx px-6 text-center">
      <h1 className="display max-w-xl text-3xl sm:text-4xl">
        Confirm your email address to watch {heading}
      </h1>
      <p className="max-w-md text-smoke">
        We sent a link to {email ? <span className="text-vein">{email}</span> : 'your address'} when
        you signed up. Open it, then come back here.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="button button-play" onClick={onRetry}>
          <Play className="fill-current" />I confirmed, play
        </button>
        <button
          type="button"
          className="button button-quiet"
          disabled={busy}
          onClick={() => void send()}
        >
          {busy ? (
            <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />
          ) : (
            <Mail />
          )}
          Send the email again
        </button>
      </div>
      <p
        role="status"
        className={`min-h-5 text-sm ${note?.tone === 'bad' ? 'text-alarm' : 'text-sard'}`}
      >
        {note?.text}
      </p>
      <Link
        href={backHref}
        className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
      >
        Back to {heading}
      </Link>
    </div>
  );
}
