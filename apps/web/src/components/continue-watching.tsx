// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { formatClock } from '@/lib/format';
import { CHANGE_EVENT, readEntries, removeEntry, type WatchEntry } from '@/lib/progress';
import { StripRow } from './title-row';

const NOTHING: WatchEntry[] = [];
let cache: { raw: string; entries: WatchEntry[] } = { raw: '[]', entries: NOTHING };

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The same list object as long as its content is the same, as React asks for. */
function snapshot(): WatchEntry[] {
  const entries = readEntries();
  const raw = JSON.stringify(entries);
  if (raw !== cache.raw) {
    cache = { raw, entries };
  }
  return cache.entries;
}

/** What this viewer began and did not finish, as kept in this browser. */
export function useWatching(): WatchEntry[] {
  return useSyncExternalStore(subscribe, snapshot, () => NOTHING);
}

/** A row of what the viewer began and did not finish. Shows nothing when there is nothing. */
export function ContinueWatching() {
  const entries = useWatching();
  if (entries.length === 0) {
    return null;
  }

  return (
    <StripRow heading="Continue watching">
      {entries.map((entry) => {
        const left = Math.max(0, entry.duration - entry.position);
        return (
          <li key={entry.key} className="group/card relative w-[min(72vw,19rem)]">
            <Link href={entry.href} className="group block">
              <div className="relative aspect-video overflow-hidden rounded-[3px] bg-ash outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 group-hover:outline-vein group-focus-visible:outline-sard">
                {entry.image ? (
                  <img src={entry.image} alt="" loading="lazy" className="size-full object-cover" />
                ) : null}
                <div className="band absolute inset-x-0 bottom-0">
                  <span style={{ width: `${(entry.position / entry.duration) * 100}%` }} />
                </div>
              </div>
              <p className="mt-2.5 truncate text-sm font-medium">{entry.name}</p>
              <p className="truncate text-xs text-smoke">
                {entry.detail ? `${entry.detail}, ` : ''}
                {formatClock(left)} left
              </p>
            </Link>
            <button
              type="button"
              aria-label={`Remove ${entry.name} from continue watching`}
              className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-onyx/80 text-vein opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-onyx focus-visible:opacity-100 pointer-coarse:opacity-100"
              onClick={() => removeEntry(entry.key)}
            >
              <X className="size-4" />
            </button>
          </li>
        );
      })}
    </StripRow>
  );
}
