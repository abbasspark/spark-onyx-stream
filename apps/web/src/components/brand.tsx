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

/**
 * The same bands, small, to stand before a heading. Three weights with the
 * amber on top: the mark of the site repeated wherever a section begins.
 */
export function HeadingBands({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex w-4 shrink-0 flex-col gap-[3px] ${className ?? ''}`}
    >
      <span className="h-[2px] bg-sard" />
      <span className="h-[2px] bg-vein/40" />
      <span className="h-[2px] bg-vein/15" />
    </span>
  );
}

/**
 * The site as it signs its pages: the logo set in the panel, or else the mark
 * with the name beside it. A logo can stand for the name or sit next to it.
 */
export function SiteBrand({
  name,
  logo,
  showName,
  size = 'header',
}: {
  name: string;
  logo: { url: string; width: number; height: number } | null;
  /** With a logo: whether the name is written next to it. */
  showName: boolean;
  size?: 'header' | 'footer';
}) {
  const text = size === 'header' ? 'heading text-lg' : 'heading text-base';
  if (!logo) {
    return (
      <>
        <BandMark className={size === 'header' ? 'size-7' : 'size-6'} />
        <span className={text}>{name}</span>
      </>
    );
  }
  return (
    <>
      {/* The height is fixed and the width follows the picture, up to a limit a phone can hold. */}
      <img
        src={logo.url}
        width={logo.width}
        height={logo.height}
        // The name is read out by the link around it, or stands beside it.
        alt=""
        className={`${size === 'header' ? 'h-7' : 'h-6'} w-auto max-w-40 object-contain object-left`}
      />
      {showName ? <span className={text}>{name}</span> : null}
    </>
  );
}
