// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { humanize } from '../lib/format';

const STATUS_TONES: Record<string, 'ok' | 'busy' | 'bad' | 'idle'> = {
  READY: 'ok',
  COMPLETED: 'ok',
  PROCESSING: 'busy',
  RUNNING: 'busy',
  UPLOADING: 'busy',
  UPLOADED: 'idle',
  QUEUED: 'idle',
  CANCELLED: 'idle',
  DELETED: 'idle',
  FAILED: 'bad',
};

/** A colored label for an asset or job status. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${STATUS_TONES[status] ?? 'idle'}`}>{humanize(status)}</span>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <div className="progress-fill" style={{ width: `${value}%` }} />
      <span className="progress-text">{value}%</span>
    </div>
  );
}

/** A message about something that went wrong. Announced to screen readers. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  return (
    <p className="note note-error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return null;
  }
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="pagination" aria-label="Pages">
      <span className="muted">
        {first}–{last} of {total}
      </span>
      <button
        type="button"
        className="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span className="muted">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <div className="page-actions">{children}</div>
    </header>
  );
}
