// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ViewerSessionProvider } from '@/components/viewer-session';
import { siteConfig } from '@/lib/config';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ViewerSessionProvider>{children}</ViewerSessionProvider>
      </body>
    </html>
  );
}
