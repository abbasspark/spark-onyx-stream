// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { MyListSync } from '@/components/my-list';
import { ViewerSessionProvider } from '@/components/viewer-session';
import { getSite } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import { MEDIA_ORIGINS_HEADER, MEDIA_ORIGINS_META } from '@/lib/delivery';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: site.name, template: `%s | ${site.name}` },
    description: site.description,
    applicationName: site.name,
    openGraph: { siteName: site.name, type: 'website' },
    twitter: { card: 'summary_large_image' },
    // An icon set in the panel takes the place of the one the website ships with.
    ...(site.icon
      ? { icons: { icon: [{ url: site.icon.url, type: 'image/png' }], apple: site.icon.url } }
      : {}),
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Where video may come from besides this site, as the proxy worked it out.
  const mediaOrigins = (await headers()).get(MEDIA_ORIGINS_HEADER) ?? '';
  const { accent } = await getSite();
  // The one colour of the interface, when the panel chose another than amber.
  const colours = accent
    ? ({ '--color-sard': accent.color, '--color-sard-deep': accent.deep } as CSSProperties)
    : undefined;
  return (
    <html lang="en" style={colours}>
      <head>
        <meta name={MEDIA_ORIGINS_META} content={mediaOrigins} />
      </head>
      <body>
        <ViewerSessionProvider>
          {children}
          <MyListSync />
        </ViewerSessionProvider>
      </body>
    </html>
  );
}
