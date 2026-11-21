// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useEffect, useState } from 'react';
import { watchingApi } from '@/lib/watching-api';
import { useViewerSession } from './viewer-session';

const NONE: ReadonlySet<string> = new Set();

/**
 * The videos of a title the signed-in viewer watched to the end, by id. Empty
 * for a visitor, and until the account has answered.
 */
export function useWatchedVideos(slug: string): ReadonlySet<string> {
  const { viewer, profile } = useViewerSession();
  const [watched, setWatched] = useState(NONE);
  // Each profile of an account has its own.
  const viewerId = viewer && profile ? `${viewer.id}:${profile.id}` : undefined;

  useEffect(() => {
    if (!viewerId) {
      setWatched(NONE);
      return;
    }
    let current = true;
    watchingApi
      .forTitle(slug)
      .then((items) => {
        if (current) {
          setWatched(new Set(items.filter((item) => item.completed).map((item) => item.id)));
        }
      })
      .catch(() => {
        // The list works without the marks.
      });
    return () => {
      current = false;
    };
  }, [slug, viewerId]);

  return watched;
}
