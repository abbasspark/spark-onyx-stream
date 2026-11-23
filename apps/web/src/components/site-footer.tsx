// SPDX-License-Identifier: AGPL-3.0-only
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Category } from '@/lib/types';
import { SiteBrand } from './brand';

/** A link of the footer: inside the site with the router, anything else as a plain link. */
function FooterLink({ label, url }: { label: string; url: string }) {
  return url.startsWith('/') ? (
    <Link href={url} className="hover:text-vein">
      {label}
    </Link>
  ) : (
    <a
      href={url}
      className="hover:text-vein"
      {...(url.startsWith('mailto:') ? {} : { rel: 'noopener noreferrer' })}
    >
      {label}
    </a>
  );
}

export function SiteFooter({
  siteName,
  logo = null,
  logoShowsName = false,
  footerText = null,
  footerLinks = [],
  categories,
  hasPlans = false,
  hasLive = false,
  languageSwitch = null,
}: {
  siteName: string;
  logo?: { url: string; width: number; height: number } | null;
  logoShowsName?: boolean;
  /** A line of the site's own: a copyright, a company name. */
  footerText?: string | null;
  /** Links of the site's own: an imprint, a privacy notice. */
  footerLinks?: { label: string; url: string }[];
  categories: Category[];
  hasPlans?: boolean;
  hasLive?: boolean;
  /** Shown when titles can be read in more than one language. */
  languageSwitch?: ReactNode;
}) {
  return (
    <footer className="gutter mt-24 border-t border-line pt-10 pb-12 text-sm text-smoke">
      <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
        <div className="flex items-center gap-2.5 text-vein" aria-label={siteName}>
          <SiteBrand name={siteName} logo={logo} showName={logoShowsName} size="footer" />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-16 gap-y-8">
          <ul className="grid content-start gap-2">
            <li>
              <Link href="/browse" className="hover:text-vein">
                Everything
              </Link>
            </li>
            <li>
              <Link href="/browse?type=MOVIE" className="hover:text-vein">
                Movies
              </Link>
            </li>
            <li>
              <Link href="/browse?type=SERIES" className="hover:text-vein">
                Series
              </Link>
            </li>
            <li>
              <Link href="/search" className="hover:text-vein">
                Search
              </Link>
            </li>
            {hasLive ? (
              <li>
                <Link href="/live" className="hover:text-vein">
                  Live
                </Link>
              </li>
            ) : null}
            {hasPlans ? (
              <li>
                <Link href="/plans" className="hover:text-vein">
                  Plans
                </Link>
              </li>
            ) : null}
          </ul>
          {categories.length > 0 ? (
            <ul className="grid grid-flow-col grid-rows-4 content-start gap-x-12 gap-y-2">
              {categories.slice(0, 12).map((category) => (
                <li key={category.slug}>
                  <Link href={`/category/${category.slug}`} className="hover:text-vein">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
      </div>
      {languageSwitch ? <div className="mt-10">{languageSwitch}</div> : null}
      {footerText || footerLinks.length > 0 ? (
        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-t border-line pt-6">
          {footerText ? <p className="max-w-2xl whitespace-pre-line">{footerText}</p> : <span />}
          {footerLinks.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {footerLinks.map((link) => (
                <li key={`${link.label} ${link.url}`}>
                  <FooterLink label={link.label} url={link.url} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <p className="mt-10 text-xs text-dust">
        Runs on{' '}
        <a
          href="https://github.com/abbasspark/spark-onyx-stream"
          className="underline underline-offset-2 hover:text-smoke"
        >
          Spark Onyx Stream
        </a>
        , open-source software under the AGPL-3.0 license.
      </p>
    </footer>
  );
}
