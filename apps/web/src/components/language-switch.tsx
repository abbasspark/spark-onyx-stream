// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { LANGUAGE_COOKIE } from '@/lib/language';

interface LanguageSwitchProps {
  /** The languages on offer, the catalog's own first, each with its name in itself. */
  languages: { tag: string; name: string }[];
  /** The language this viewer reads in now. */
  current: string;
  /** The tag of the catalog's own language, which needs no cookie. */
  own: string;
}

/**
 * Chooses the language titles and their descriptions are shown in. The site
 * around them stays in English. The choice is kept in a cookie for a year.
 */
export function LanguageSwitch({ languages, current, own }: LanguageSwitchProps) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();

  const choose = (tag: string) => {
    document.cookie =
      tag === own
        ? `${LANGUAGE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
        : `${LANGUAGE_COOKIE}=${encodeURIComponent(tag)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    // The pages are built again on the server, now with the other language.
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center gap-2.5">
      <Languages className="size-4 text-dust" aria-hidden="true" />
      <label htmlFor={id} className="text-dust">
        Titles in
      </label>
      <select
        id={id}
        value={current}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className="h-9 rounded-[3px] border border-line bg-coal px-2.5 text-vein hover:border-vein/60 disabled:opacity-60"
      >
        {languages.map((language) => (
          <option key={language.tag} value={language.tag} lang={language.tag}>
            {language.name}
          </option>
        ))}
      </select>
    </div>
  );
}
