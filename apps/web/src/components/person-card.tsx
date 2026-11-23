// SPDX-License-Identifier: AGPL-3.0-only
import Link from 'next/link';
import type { Credit } from '@/lib/types';

/** The first letters of a name, for somebody without a picture. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return letters.map((word) => word?.charAt(0).toLocaleUpperCase() ?? '').join('');
}

/** One person of the cast: their picture, their name, and who they play. */
export function PersonCard({ person }: { person: Credit }) {
  return (
    <Link href={`/person/${person.slug}`} className="group block">
      <div className="aspect-[4/5] overflow-hidden rounded-[3px] bg-ash outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 group-hover:outline-vein group-focus-visible:outline-sard">
        {person.portrait ? (
          <img
            src={person.portrait.url}
            alt=""
            width={person.portrait.width}
            height={person.portrait.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top"
          />
        ) : (
          <div
            aria-hidden="true"
            className="display flex size-full items-center justify-center text-3xl text-dust"
          >
            {initials(person.name)}
          </div>
        )}
      </div>
      <p className="mt-2.5 text-sm leading-snug font-medium">{person.name}</p>
      {person.role ? <p className="mt-0.5 text-sm leading-snug text-smoke">{person.role}</p> : null}
    </Link>
  );
}
