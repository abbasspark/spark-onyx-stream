// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Shown when a page could not be built, most often because the catalog did not answer. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="gutter flex min-h-[70dvh] flex-col justify-center pt-24">
      <h1 className="display max-w-3xl text-4xl sm:text-5xl">This page could not be loaded</h1>
      <p className="mt-6 max-w-xl text-lg text-smoke">
        The catalog did not answer. That is usually over within a moment.
      </p>
      <div className="mt-8">
        <button type="button" className="button button-play" onClick={reset}>
          <RotateCcw />
          Try again
        </button>
      </div>
      {error.digest ? (
        <p className="mt-10 text-xs text-dust">
          If it keeps happening, tell the operator of this site this code: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
