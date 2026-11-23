// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { MyListSync } from '@/components/my-list';
import { ViewerSessionProvider } from '@/components/viewer-session';
import { siteConfig } from '@/lib/config';
import { MEDIA_ORIGINS_HEADER, MEDIA_ORIGINS_META } from '@/lib/delivery';
import './globals.css';

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
    description: siteConfig.description,
    applicationName: siteConfig.name,
    openGraph: { siteName: siteConfig.name, type: 'website' },
    twitter: { card: 'summary_large_image' },
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Where video may come from besides this site, as the proxy worked it out.
  const mediaOrigins = (await headers()).get(MEDIA_ORIGINS_HEADER) ?? '';
  return (
    <html lang="en">
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
