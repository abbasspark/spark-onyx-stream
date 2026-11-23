// SPDX-License-Identifier: AGPL-3.0-only
import {
  brandingSchema,
  DEFAULT_BRANDING,
  iconProblem,
  isLinkTarget,
  readBranding,
} from './branding.rules.js';

const full = {
  name: ' Kino Nord ',
  description: '',
  logoId: null,
  logoShowsName: true,
  iconId: null,
  accent: '#4FC3F7',
  footerText: '© 2026 Kino Nord GmbH',
  footerLinks: [{ label: ' Imprint ', url: '/imprint' }],
};

describe('brandingSchema', () => {
  it('cleans what was typed', () => {
    expect(brandingSchema.parse(full)).toEqual({
      ...full,
      name: 'Kino Nord',
      description: null,
      accent: '#4fc3f7',
      footerLinks: [{ label: 'Imprint', url: '/imprint' }],
    });
  });

  it('refuses a colour that is none, a long name and too many links', () => {
    expect(brandingSchema.safeParse({ ...full, accent: 'blue' }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...full, name: 'x'.repeat(61) }).success).toBe(false);
    const links = Array.from({ length: 9 }, () => ({ label: 'A', url: '/a' }));
    expect(brandingSchema.safeParse({ ...full, footerLinks: links }).success).toBe(false);
  });

  it('treats an empty colour as the one the site ships with', () => {
    expect(brandingSchema.parse({ ...full, accent: ' ' }).accent).toBeNull();
  });
});

describe('isLinkTarget', () => {
  it('lets pages and email addresses through', () => {
    expect(isLinkTarget('/imprint')).toBe(true);
    expect(isLinkTarget('https://example.com/privacy')).toBe(true);
    expect(isLinkTarget('mailto:hello@example.com')).toBe(true);
  });

  it('stops what runs code or leads nowhere', () => {
    expect(isLinkTarget('javascript:alert(1)')).toBe(false);
    expect(isLinkTarget('data:text/html,x')).toBe(false);
    expect(isLinkTarget('//evil.example')).toBe(false);
    expect(isLinkTarget('imprint')).toBe(false);
    expect(isLinkTarget('mailto:nobody')).toBe(false);
  });
});

describe('readBranding', () => {
  it('falls back to how the site ships for what is missing or broken', () => {
    expect(readBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(readBranding({ name: 'Kino Nord' })).toEqual({ ...DEFAULT_BRANDING, name: 'Kino Nord' });
    expect(readBranding({ accent: 'nonsense' })).toEqual(DEFAULT_BRANDING);
  });
});

describe('iconProblem', () => {
  it('asks for a square PNG of some size', () => {
    expect(iconProblem({ mimeType: 'image/png', width: 512, height: 512 })).toBeNull();
    expect(iconProblem({ mimeType: 'image/jpeg', width: 512, height: 512 })).toMatch(/PNG/);
    expect(iconProblem({ mimeType: 'image/png', width: 32, height: 32 })).toMatch(/too small/);
    expect(iconProblem({ mimeType: 'image/png', width: 512, height: 300 })).toMatch(/square/);
  });
});
