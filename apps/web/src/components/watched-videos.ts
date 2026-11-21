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
  const { viewer } = useViewerSession();
  const [watched, setWatched] = useState(NONE);
  const viewerId = viewer?.id;

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
