// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The mark: a cut through banded stone. Three bands of uneven weight, the
 * middle one amber.
 */
export function BandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="1" y="4" width="26" height="6" fill="var(--color-vein)" />
      <rect x="1" y="13" width="26" height="2.5" fill="var(--color-sard)" />
      <rect x="1" y="18.5" width="26" height="5.5" fill="var(--color-vein)" opacity="0.55" />
    </svg>
  );
}
