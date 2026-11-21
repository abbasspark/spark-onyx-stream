// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ChevronDown, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Category } from '@/lib/types';
import { AccountMenu } from './account-menu';
import { BandMark } from './brand';

interface SiteHeaderProps {
  siteName: string;
  categories: Category[];
}

const LINKS = [
  { href: '/browse?type=MOVIE', label: 'Movies', type: 'MOVIE' },
  { href: '/browse?type=SERIES', label: 'Series', type: 'SERIES' },
] as const;

/**
 * The bar at the top of every page. It lies over the artwork and is
 * see-through at the top of a page, then turns solid once the page scrolls.
 */
export function SiteHeader({ siteName, categories }: SiteHeaderProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Going to another page closes whatever was open.
  const location = `${pathname}?${params}`;
  useEffect(() => {
    setMenuOpen(false);
    setCategoriesOpen(false);
  }, [location]);

  useEffect(() => {
    if (!categoriesOpen) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!categoriesMenu.current?.contains(event.target as Node)) {
        setCategoriesOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoriesOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [categoriesOpen]);

  // The page behind the open menu must not scroll.
  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [menuOpen]);

  const currentType = pathname === '/browse' ? params.get('type') : null;
  const currentCategory = pathname === '/browse' ? params.get('category') : null;
  const linkClass = (active: boolean) =>
    `heading text-base transition-colors hover:text-vein ${active ? 'text-vein' : 'text-smoke'}`;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        solid || menuOpen ? 'bg-onyx' : 'bg-linear-to-b from-onyx/85 to-transparent'
      }`}
    >
      <div className="gutter flex h-16 items-center gap-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label={`${siteName}, home`}
        >
          <BandMark className="size-7" />
          <span className="heading text-lg">{siteName}</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={currentType === link.type && !currentCategory ? 'page' : undefined}
              className={linkClass(currentType === link.type && !currentCategory)}
            >
              {link.label}
            </Link>
          ))}
          {categories.length > 0 ? (
            <div ref={categoriesMenu} className="relative">
              <button
                type="button"
                aria-expanded={categoriesOpen}
                aria-controls="header-categories"
                className={`${linkClass(Boolean(currentCategory))} flex items-center gap-1`}
                onClick={() => setCategoriesOpen((open) => !open)}
              >
                Categories
                <ChevronDown
                  className={`size-4 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {categoriesOpen ? (
                <ul
                  id="header-categories"
                  className="absolute top-full left-0 mt-3 grid max-h-[70dvh] w-max min-w-52 grid-flow-col grid-rows-[repeat(8,auto)] gap-x-8 overflow-y-auto border border-line bg-coal px-5 py-4"
                >
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/browse?category=${category.slug}`}
                        aria-current={currentCategory === category.slug ? 'page' : undefined}
                        className="block py-1.5 text-sm text-smoke hover:text-vein aria-[current]:text-sard"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </nav>

        <form action="/search" role="search" className="ml-auto hidden md:block">
          <label className="relative block">
            <span className="sr-only">Search titles</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-smoke"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder="Search"
              autoComplete="off"
              className="h-10 w-44 rounded-[3px] border border-vein/20 bg-onyx/50 pr-3 pl-9 text-sm placeholder:text-smoke focus:w-64 focus:border-vein/60 focus:outline-none motion-safe:transition-[width]"
            />
          </label>
        </form>
        <div className="hidden md:block">
          <AccountMenu />
        </div>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <Link
            href="/search"
            aria-label="Search"
            className="flex size-11 items-center justify-center"
          >
            <Search className="size-5" />
          </Link>
          <div className="mx-1">
            <AccountMenu />
          </div>
          <button
            type="button"
            aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={menuOpen}
            className="flex size-11 items-center justify-center"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          aria-label="Main"
          className="gutter h-[calc(100dvh-4rem)] overflow-y-auto bg-onyx pt-4 pb-12 md:hidden"
        >
          <ul className="grid gap-1">
            {[{ href: '/browse', label: 'Everything' }, ...LINKS].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="display block py-2 text-2xl">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {categories.length > 0 ? (
            <>
              <h2 className="mt-8 mb-2 text-sm text-smoke">Categories</h2>
              <ul className="grid grid-cols-2 gap-x-6">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link href={`/browse?category=${category.slug}`} className="block py-2.5">
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
