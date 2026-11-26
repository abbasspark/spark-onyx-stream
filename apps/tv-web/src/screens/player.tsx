// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Button, Message, Spinner } from '@/components/ui';
import { type Playback, api, token } from '@/lib/api';
import { clock } from '@/lib/format';
import { type Key } from '@/lib/platform';
import { focusFirst, useRemote } from '@/lib/remote';
import type { Playing } from './title';

/** How long the controls stay after the last press of the remote. */
const HIDE_AFTER_MS = 4000;
const SKIP_SECONDS = 10;
/** How often the place in the video is saved. */
const REPORT_EVERY_MS = 30_000;

type Load =
  { kind: 'loading' } | { kind: 'ready'; playback: Playback } | { kind: 'trouble'; text: string };

/**
 * The player. A remote has four arrows and a centre, so everything is made of
 * those: left and right skip, OK plays and pauses, up and down show the
 * controls, back leaves. The media keys do what they say.
 */
export function Player({ playing, onBack }: { playing: Playing; onBack: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let over = false;
    const start = playing.episodeId
      ? api.playEpisode(playing.episodeId)
      : api.playTitle(playing.slug);
    start
      .then((playback) => {
        if (!over) {
          setLoad({ kind: 'ready', playback });
        }
      })
      .catch((error: Error) => {
        if (!over) {
          setLoad({ kind: 'trouble', text: error.message });
        }
      });
    return () => {
      over = true;
    };
  }, [playing]);

  if (load.kind === 'loading') {
    return <Spinner label={`Starting ${playing.heading}`} />;
  }
  if (load.kind === 'trouble') {
    return <Trouble text={load.text} onBack={onBack} />;
  }
  return <Playing_ playing={playing} playback={load.playback} onBack={onBack} />;
}

function Trouble({ text, onBack }: { text: string; onBack: () => void }) {
  useRemote((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    return false;
  });
  useEffect(() => focusFirst(), []);
  return (
    <Message title="This could not be played">
      {text}
      <span className="actions">
        <Button primary autoFocus onClick={onBack}>
          Back
        </Button>
      </span>
    </Message>
  );
}

/** Gives the video its source: natively where the television can, otherwise through hls.js. */
function attach(video: HTMLVideoElement, url: string, onFail: (text: string) => void): () => void {
  if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
    video.src = url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }
  // A desktop browser, used for development. Televisions never load this.
  let destroy = () => undefined as void;
  void import('hls.js').then(({ default: Hls }) => {
    if (!Hls.isSupported()) {
      onFail('This device cannot play the video.');
      return;
    }
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        onFail('The video stopped because of a problem with the stream.');
      }
    });
    destroy = () => hls.destroy();
  });
  return () => destroy();
}

function Playing_({
  playing,
  playback,
  onBack,
}: {
  playing: Playing;
  playback: Playback;
  onBack: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(playing.startAt);
  const [duration, setDuration] = useState(0);
  const [shown, setShown] = useState(true);
  const [wake, setWake] = useState(0);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const latest = useRef({ position: playing.startAt, duration: 0 });

  // Loading the video, and starting where the viewer was.
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return undefined;
    }
    const detach = attach(element, playback.manifestUrl, setTrouble);
    const ready = () => {
      if (playing.startAt > 0 && element.currentTime < 1) {
        element.currentTime = playing.startAt;
      }
      void element.play().catch(() => setPaused(true));
    };
    element.addEventListener('loadedmetadata', ready, { once: true });
    return () => {
      element.removeEventListener('loadedmetadata', ready);
      detach();
    };
  }, [playback.manifestUrl, playing.startAt]);

  // Where the video is, for the bar and for what is saved.
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return undefined;
    }
    const update = () => {
      latest.current = {
        position: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : 0,
      };
      setPosition(element.currentTime);
      setDuration(latest.current.duration);
    };
    const waiting = () => setBuffering(true);
    const going = () => setBuffering(false);
    element.addEventListener('timeupdate', update);
    element.addEventListener('waiting', waiting);
    element.addEventListener('playing', going);
    element.addEventListener('pause', () => setPaused(true));
    element.addEventListener('play', () => setPaused(false));
    element.addEventListener('ended', onBack);
    element.addEventListener('error', () => setTrouble('The video could not be played.'));
    return () => {
      element.removeEventListener('timeupdate', update);
      element.removeEventListener('waiting', waiting);
      element.removeEventListener('playing', going);
      element.removeEventListener('ended', onBack);
    };
  }, [onBack]);

  // Saving the place: every half minute, and once when leaving.
  useEffect(() => {
    const save = () => {
      const { position: at, duration: length } = latest.current;
      if (length > 0 && at > 0) {
        void api.reportPosition(playing.slug, playing.episodeId, at, length).catch(() => undefined);
      }
    };
    const timer = window.setInterval(save, REPORT_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      save();
    };
  }, [playing.slug, playing.episodeId]);

  // Holding the place among the devices that play at once.
  useEffect(() => {
    const ticket = playback.stream;
    if (!ticket) {
      return undefined;
    }
    const base = `/v1/viewer/streams/${encodeURIComponent(ticket.id)}`;
    const headers: Record<string, string> = {};
    const kept = token();
    if (kept) {
      headers.Authorization = `Bearer ${kept}`;
    }
    const timer = window.setInterval(
      () => {
        fetch(`${base}/beat`, { method: 'POST', headers })
          .then((response) => {
            // 410: the place was taken away by another device. Stop, as asked.
            if (response.status === 410) {
              video.current?.pause();
              setTrouble('Another device of your account started playing, so this one stopped.');
            }
          })
          .catch(() => undefined);
      },
      Math.max(5, ticket.beatSeconds) * 1000,
    );
    return () => {
      window.clearInterval(timer);
      fetch(base, { method: 'DELETE', headers }).catch(() => undefined);
    };
  }, [playback.stream]);

  // The controls go away by themselves while the picture runs.
  useEffect(() => {
    setShown(true);
    if (paused) {
      return undefined;
    }
    const timer = window.setTimeout(() => setShown(false), HIDE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [wake, paused]);

  const jump = (seconds: number) => {
    const element = video.current;
    if (element) {
      const end = Number.isFinite(element.duration) ? element.duration : Infinity;
      element.currentTime = Math.min(Math.max(0, element.currentTime + seconds), end);
    }
    setWake(Date.now());
  };
  const toggle = () => {
    const element = video.current;
    if (element) {
      if (element.paused) {
        void element.play();
      } else {
        element.pause();
      }
    }
    setWake(Date.now());
  };

  useRemote((key: Key) => {
    if (trouble) {
      return key === 'back' ? (onBack(), true) : false;
    }
    switch (key) {
      case 'enter':
      case 'playPause':
        toggle();
        return true;
      case 'play':
        void video.current?.play();
        setWake(Date.now());
        return true;
      case 'pause':
        video.current?.pause();
        setWake(Date.now());
        return true;
      case 'left':
      case 'rewind':
        jump(-SKIP_SECONDS);
        return true;
      case 'right':
      case 'forward':
        jump(SKIP_SECONDS);
        return true;
      case 'up':
      case 'down':
        setWake(Date.now());
        return true;
      case 'back':
      case 'stop':
        onBack();
        return true;
      default:
        return false;
    }
  });

  if (trouble) {
    return <Trouble text={trouble} onBack={onBack} />;
  }

  const through = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div className="player">
      <video ref={video} playsInline poster={playback.posterUrl ?? undefined} />
      {buffering && !paused ? <div className="spinner centre" aria-hidden="true" /> : null}
      {shown || paused ? (
        <div className="controls">
          <h1>{playing.heading}</h1>
          {playing.detail ? <p>{playing.detail}</p> : null}
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${through}%` }} />
          </div>
          <div className="times">
            <span>{clock(position)}</span>
            <span className="keys">
              {paused ? 'Paused · OK plays' : 'OK pauses · ← → skip 10 seconds'}
            </span>
            <span>{clock(duration)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
