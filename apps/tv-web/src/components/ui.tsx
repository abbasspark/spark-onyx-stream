// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode } from 'react';
import type { TitleCard, WatchingItem } from '@/lib/api';

export function Button({
  children,
  onClick,
  primary,
  autoFocus,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? 'button primary' : 'button'}
      data-focus
      data-autofocus={autoFocus ? '' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="message">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="message" role="status">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

/** A card of a row: a poster or a wide picture, with the name under it. */
export function Card({
  title,
  wide,
  onOpen,
  progress,
  autoFocus,
}: {
  title: TitleCard;
  wide: boolean;
  onOpen: () => void;
  progress?: number;
  autoFocus?: boolean;
}) {
  const picture = wide ? (title.backdrop ?? title.poster) : (title.poster ?? title.backdrop);
  return (
    <button
      type="button"
      className={wide ? 'card wide' : 'card'}
      data-focus
      data-autofocus={autoFocus ? '' : undefined}
      onClick={onOpen}
    >
      <span className="picture">
        {picture ? (
          <img src={picture.url} alt="" loading="lazy" />
        ) : (
          <span className="blank">{title.name}</span>
        )}
        {title.access === 'PAID' ? <span className="tag">Paid</span> : null}
        {progress !== undefined && progress > 0 ? (
          <span className="progress">
            <span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
          </span>
        ) : null}
      </span>
      <span className="name">{title.name}</span>
    </button>
  );
}

/** A card of the "Continue watching" row, made of what the viewer was watching. */
export function ContinueCard({
  item,
  onOpen,
  autoFocus,
}: {
  item: WatchingItem;
  onOpen: () => void;
  autoFocus?: boolean;
}) {
  const label = item.episode
    ? `${item.title.name} · S${item.episode.seasonNumber} E${item.episode.number}`
    : item.title.name;
  return (
    <button
      type="button"
      className="card wide"
      data-focus
      data-autofocus={autoFocus ? '' : undefined}
      onClick={onOpen}
    >
      <span className="picture">
        {item.image ? (
          <img src={item.image.url} alt="" loading="lazy" />
        ) : (
          <span className="blank">{item.title.name}</span>
        )}
        <span className="progress">
          <span
            style={{
              width: `${item.duration > 0 ? Math.min(100, Math.round((item.position / item.duration) * 100)) : 0}%`,
            }}
          />
        </span>
      </span>
      <span className="name">{label}</span>
    </button>
  );
}
