// SPDX-License-Identifier: AGPL-3.0-only
'use client';

/**
 * The last resort, when even the frame of the site failed. It cannot rely on
 * the stylesheet, so it carries its few styles itself.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeContent: 'center',
          gap: '1.5rem',
          padding: '2rem',
          background: '#000',
          color: '#f4f1ea',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem' }}>The site could not be loaded</h1>
        <button
          type="button"
          onClick={reset}
          style={{
            justifySelf: 'start',
            height: '3rem',
            padding: '0 1.5rem',
            border: 0,
            borderRadius: 3,
            background: '#e6a85c',
            color: '#000',
            font: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
