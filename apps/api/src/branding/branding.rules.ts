// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { normalizeHex } from './color.js';

/** Under this key the branding is kept in the settings table. */
export const BRANDING_SETTINGS_KEY = 'branding';

/** The accent the website ships with: the amber of sardonyx. */
export const DEFAULT_ACCENT = '#e6a85c';
/** What the website says about itself until someone writes a sentence. */
export const DEFAULT_DESCRIPTION = 'Movies and series, streamed to you.';

export const MAX_FOOTER_LINKS = 8;

/** A link in the footer of the website: an imprint, a privacy notice, a contact address. */
export interface FooterLink {
  label: string;
  url: string;
}

/** How the website presents itself. Null means: as it ships. */
export interface BrandingSettings {
  /** The name of the site. Null: the SITE_NAME of the installation. */
  name: string | null;
  /** A sentence about the site, for search engines and link previews. */
  description: string | null;
  /** The picture shown as the logo, in the header and the footer. */
  logoId: string | null;
  /** Whether the name is written next to the logo, or the logo stands for it. */
  logoShowsName: boolean;
  /** The picture for the browser tab and home screens. */
  iconId: string | null;
  /** The one colour of the interface, as "#rrggbb". */
  accent: string | null;
  /** A line at the bottom of every page: a copyright, a company name. */
  footerText: string | null;
  footerLinks: FooterLink[];
}

export const DEFAULT_BRANDING: BrandingSettings = {
  name: null,
  description: null,
  logoId: null,
  logoShowsName: false,
  iconId: null,
  accent: null,
  footerText: null,
  footerLinks: [],
};

/** A text field that may be left empty, which means "as it ships". */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullable()
    .transform((value) => value || null);

/**
 * Where a footer link may lead: a page of this or another site, or an email
 * address. Nothing that runs code when clicked.
 */
export function isLinkTarget(value: string): boolean {
  if (/^\/(?!\/)/.test(value)) {
    return true;
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

const footerLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Give the link a label')
    .max(40, 'Keep the label to 40 characters'),
  url: z.string().trim().max(500).refine(isLinkTarget, {
    message:
      'A link starts with https://, with / for a page of this site, or with mailto: for an email address',
  }),
});

export const brandingSchema = z.object({
  name: optionalText(60, 'Keep the name to 60 characters'),
  description: optionalText(200, 'Keep the description to 200 characters'),
  logoId: z.uuid().nullable(),
  logoShowsName: z.boolean(),
  iconId: z.uuid().nullable(),
  accent: z
    .string()
    .nullable()
    .transform((value, context) => {
      if (value === null || value.trim() === '') {
        return null;
      }
      const hex = normalizeHex(value);
      if (!hex) {
        context.addIssue({ code: 'custom', message: 'Write the colour as #rrggbb, like #e6a85c' });
        return z.NEVER;
      }
      return hex;
    }),
  footerText: optionalText(300, 'Keep the footer text to 300 characters'),
  footerLinks: z
    .array(footerLinkSchema)
    .max(MAX_FOOTER_LINKS, `The footer holds ${MAX_FOOTER_LINKS} links at most`),
});
export type BrandingInput = z.infer<typeof brandingSchema>;

/**
 * Reads the branding from what the settings table holds. Whatever is missing
 * or was written by another version falls back to how the site ships, so a
 * damaged row can never keep the website from showing.
 */
export function readBranding(value: unknown): BrandingSettings {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_BRANDING;
  }
  const parsed = brandingSchema.partial().safeParse(value);
  if (!parsed.success) {
    return DEFAULT_BRANDING;
  }
  return { ...DEFAULT_BRANDING, ...parsed.data };
}

/** What a picture has to be to serve as the icon of the site. */
export function iconProblem(image: {
  mimeType: string;
  width: number;
  height: number;
}): string | null {
  if (image.mimeType !== 'image/png') {
    return 'The icon has to be a PNG picture: that is what every browser shows in its tab';
  }
  if (Math.min(image.width, image.height) < 64) {
    return 'The icon is too small. Use a picture of at least 64 by 64 pixels, better 512 by 512';
  }
  const ratio = image.width / image.height;
  if (ratio < 0.95 || ratio > 1.05) {
    return 'The icon has to be square';
  }
  return null;
}
