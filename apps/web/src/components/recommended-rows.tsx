// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useEffect, useState } from 'react';
import { languageFromCookies } from '@/lib/language';
import {
  type RecommendationRow,
  recommendationsApi,
  rowHeading,
  usableRows,
} from '@/lib/recommendations';
import { PosterCard } from './poster-card';
import { StripRow } from './title-row';
import { useViewerSession } from './viewer-session';

/**
 * Rows of titles like the ones this profile watched last, each named after
 * the title it comes from. Nothing for a visitor, for a profile that watched
 * nothing yet, or when the rows cannot be read: the page is complete without.
 */
export function RecommendedRows({ heading }: { heading: string }) {
  const { state, viewer, profile } = useViewerSession();
  const profileId = profile?.id ?? null;
  const signedIn = state === 'ready' && viewer !== null;
  const [rows, setRows] = useState<RecommendationRow[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setRows([]);
      return;
    }
    let current = true;
    recommendationsApi
      .rows(languageFromCookies(document.cookie))
      .then((answer) => {
        if (current) {
          setRows(usableRows(answer));
        }
      })
      .catch(() => {
        if (current) {
          setRows([]);
        }
      });
    return () => {
      current = false;
    };
  }, [signedIn, profileId]);

  return rows.map((row) => (
    <StripRow key={row.because.id} heading={rowHeading(heading, row.because.name)}>
      {row.titles.map((title) => (
        <li key={title.id} className="w-[clamp(8.5rem,38vw,12.5rem)]">
          <PosterCard title={title} />
        </li>
      ))}
    </StripRow>
  ));
}
