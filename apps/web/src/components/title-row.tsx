// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

interface StripRowProps {
  heading: string;
  /** Where "See all" leads. Left out when the row already shows everything. */
  href?: string;
  children: ReactNode;
}

/**
 * A heading with a strip of cards that scrolls sideways. Touch and trackpads
 * scroll it directly. The arrow buttons are for mice and appear only when
 * there is more in that direction.
 */
export function StripRow({ heading, href, children }: StripRowProps) {
  const strip = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const [canGo, setCanGo] = useState({ back: false, forward: false });

  const measure = useCallback(() => {
    const element = strip.current;
    if (!element) {
      return;
    }
    const back = element.scrollLeft > 8;
    const forward = element.scrollLeft + element.clientWidth < element.scrollWidth - 8;
    setCanGo((current) =>
      current.back === back && current.forward === forward ? current : { back, forward },
    );
  }, []);

  useEffect(() => {
    measure();
    const element = strip.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, children]);

  const scroll = (direction: -1 | 1) => {
    const element = strip.current;
    if (element) {
      element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: 'smooth' });
    }
  };

  const arrow =
    'absolute top-0 z-10 hidden h-full w-[clamp(1rem,4vw,3.5rem)] items-center justify-center bg-onyx/70 text-vein opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 hover:bg-onyx/90 focus-visible:opacity-100 pointer-fine:flex';

  return (
    <section aria-labelledby={headingId} className="group/row">
      <div className="gutter mb-3 flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="heading text-lg sm:text-xl">
          {heading}
        </h2>
        {href ? (
          <Link href={href} className="shrink-0 text-sm text-smoke hover:text-vein">
            See all
          </Link>
        ) : null}
      </div>
      <div className="relative">
        {canGo.back ? (
          <button
            type="button"
            aria-label={`Scroll ${heading} back`}
            className={`${arrow} left-0`}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft className="size-7" />
          </button>
        ) : null}
        <ul ref={strip} className="strip" onScroll={measure}>
          {children}
        </ul>
        {canGo.forward ? (
          <button
            type="button"
            aria-label={`Scroll ${heading} forward`}
            className={`${arrow} right-0`}
            onClick={() => scroll(1)}
          >
            <ChevronRight className="size-7" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
