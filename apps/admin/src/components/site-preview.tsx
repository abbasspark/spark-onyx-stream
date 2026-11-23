// SPDX-License-Identifier: AGPL-3.0-only
import type { CSSProperties } from 'react';
import type { FooterLink } from '@/api/types';

/** The colours of the website, which the panel does not share. */
const SITE = {
  onyx: '#000000',
  coal: '#0d0d0e',
  line: '#2b2b2e',
  vein: '#f4f1ea',
  smoke: '#a9a6a0',
  dust: '#77746f',
};

interface SitePreviewProps {
  name: string;
  /** Address of the logo, if one is set. */
  logoUrl: string | null;
  logoShowsName: boolean;
  /** Address of the icon, if one is set. */
  iconUrl: string | null;
  accent: string;
  accentDeep: string;
  footerText: string;
  footerLinks: FooterLink[];
}

/** The mark the website ships with: three bands, the middle one in the accent. */
function Mark({ accent, size }: { accent: string; size: number }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
      <rect x="1" y="4" width="26" height="6" fill={SITE.vein} />
      <rect x="1" y="13" width="26" height="2.5" fill={accent} />
      <rect x="1" y="18.5" width="26" height="5.5" fill={SITE.vein} opacity="0.55" />
    </svg>
  );
}

function Brand({
  name,
  logoUrl,
  showName,
  accent,
  height,
}: {
  name: string;
  logoUrl: string | null;
  showName: boolean;
  accent: string;
  height: number;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          style={{ height, maxWidth: 120 }}
          className="w-auto shrink-0 object-contain object-left"
        />
      ) : (
        <Mark accent={accent} size={height} />
      )}
      {!logoUrl || showName ? (
        <span className="truncate text-[13px] font-bold tracking-tight">{name}</span>
      ) : null}
    </span>
  );
}

/**
 * A small picture of the website with the branding of the form applied: the
 * browser tab, the header, something to play, the footer. It is drawn here,
 * not loaded from the site, so it shows what is typed before it is saved.
 */
export function SitePreview({
  name,
  logoUrl,
  logoShowsName,
  iconUrl,
  accent,
  accentDeep,
  footerText,
  footerLinks,
}: SitePreviewProps) {
  const page: CSSProperties = { background: SITE.onyx, color: SITE.vein };
  return (
    <div
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ borderColor: SITE.line }}
      aria-label="Preview of the website"
      role="img"
    >
      {/* The browser tab. */}
      <div className="flex items-end gap-2 px-3 pt-2" style={{ background: '#1f1f22' }}>
        <div
          className="flex max-w-[70%] items-center gap-2 rounded-t-lg px-3 py-1.5 text-[11px]"
          style={{ background: '#2e2e33', color: '#e8e6e1' }}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" className="size-3.5 shrink-0 rounded-[3px] object-cover" />
          ) : (
            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-black">
              <Mark accent={accent} size={10} />
            </span>
          )}
          <span className="truncate">{name}</span>
        </div>
      </div>

      <div style={page}>
        {/* The header. */}
        <div className="flex items-center gap-4 px-4 py-3">
          <Brand
            name={name}
            logoUrl={logoUrl}
            showName={logoShowsName}
            accent={accent}
            height={20}
          />
          <span className="ml-1 hidden gap-3 text-[11px] sm:flex" style={{ color: SITE.smoke }}>
            <span style={{ color: SITE.vein }}>Movies</span>
            <span>Series</span>
          </span>
          <span
            className="ml-auto rounded-sm border px-2 py-1 text-[10px]"
            style={{ borderColor: SITE.line }}
          >
            Sign in
          </span>
        </div>

        {/* Something to play. */}
        <div
          className="px-4 pt-7 pb-5"
          style={{
            background: `linear-gradient(180deg, #23211d 0%, ${SITE.coal} 62%, ${SITE.onyx} 100%)`,
          }}
        >
          <p className="text-[10px]" style={{ color: accent }}>
            New this week
          </p>
          <p className="mt-1 text-xl leading-tight font-extrabold tracking-tight">
            The Quiet Field
          </p>
          <p className="mt-1 text-[11px]" style={{ color: SITE.smoke }}>
            2024 / Drama / 1 h 58 min
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="rounded-sm px-3 py-1.5 text-[11px] font-bold"
              style={{ background: accent, color: SITE.onyx }}
            >
              Play
            </span>
            <span
              className="rounded-sm px-3 py-1.5 text-[11px] font-bold"
              style={{ background: accentDeep, color: SITE.onyx }}
            >
              Pressed
            </span>
            <span
              className="rounded-sm border px-3 py-1.5 text-[11px]"
              style={{ borderColor: SITE.line }}
            >
              My list
            </span>
          </div>
          {/* Progress, as on a title someone started. */}
          <div className="mt-4 h-[3px] w-40 rounded-full" style={{ background: SITE.line }}>
            <div className="h-full w-3/5 rounded-full" style={{ background: accent }} />
          </div>
          <p className="mt-3 text-[11px]" style={{ color: SITE.smoke }}>
            A harvest, a funeral and a letter.{' '}
            <span className="underline underline-offset-2" style={{ color: accent }}>
              More about it
            </span>
          </p>
        </div>

        {/* The footer. */}
        <div
          className="grid gap-3 border-t px-4 py-4 text-[10px]"
          style={{ borderColor: SITE.line, color: SITE.smoke }}
        >
          <Brand
            name={name}
            logoUrl={logoUrl}
            showName={logoShowsName}
            accent={accent}
            height={16}
          />
          {footerText || footerLinks.length > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
              <span className="whitespace-pre-line">{footerText}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {footerLinks.map((link, index) => (
                  // Rows can hold the same words while they are typed.
                  <span key={`${index}-${link.label}`}>{link.label}</span>
                ))}
              </span>
            </div>
          ) : null}
          <span style={{ color: SITE.dust }}>Runs on Spark Onyx Stream.</span>
        </div>
      </div>
    </div>
  );
}
