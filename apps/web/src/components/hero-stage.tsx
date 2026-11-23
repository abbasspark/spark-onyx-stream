// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useEffect, useState } from 'react';
import type { TitleCard } from '@/lib/types';
import { Hero } from './hero';

/** How long one title holds the opening before the next takes its turn. */
const TURN_MS = 9000;

/**
 * The opening of the home page when it has several titles: they take turns.
 * The turn waits while the pointer or the keyboard is on the opening, while
 * the page is in the background, and for visitors who asked for less motion,
 * who change the title themselves.
 */
export function HeroStage({ titles }: { titles: TitleCard[] }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  const count = titles.length;
  const current = titles[Math.min(index, count - 1)] as TitleCard;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  const turning = count > 1 && !held && !still;
  useEffect(() => {
    if (!turning) {
      return;
    }
    // Checked at every turn: in a background tab the title stays, and the next turn asks again.
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setIndex((value) => (value + 1) % count);
      }
    }, TURN_MS);
    return () => window.clearInterval(timer);
  }, [turning, index, count]);

  if (count === 1) {
    return <Hero title={current} />;
  }

  return (
    <div
      className="relative"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div key={current.id} className="hero-turn">
        <Hero title={current} />
      </div>
      <div
        role="group"
        aria-label="Featured titles"
        className="gutter absolute right-0 bottom-6 z-10 flex items-center gap-1.5 sm:bottom-10"
      >
        {titles.map((title, at) => (
          <button
            key={title.id}
            type="button"
            aria-label={`Show ${title.name}`}
            aria-current={at === index ? 'true' : undefined}
            onClick={() => setIndex(at)}
            className="group flex h-8 w-7 items-center sm:w-9"
          >
            <span className="band block w-full overflow-hidden transition-[height] group-hover:h-[5px]">
              {at === index ? (
                <span
                  key={`${index}-${turning}`}
                  className={turning ? 'hero-turn-band' : undefined}
                  style={turning ? { animationDuration: `${TURN_MS}ms` } : { width: '100%' }}
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
