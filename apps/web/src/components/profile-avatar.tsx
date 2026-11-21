// SPDX-License-Identifier: AGPL-3.0-only
import { colorOf, initialOf, type Profile } from '@/lib/profiles';

/**
 * The picture of a profile: its colour with the first letter of its name.
 * The size comes from the class, and the letter scales with it.
 */
export function ProfileAvatar({
  profile,
  className = '',
}: {
  profile: Pick<Profile, 'name' | 'color'>;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`display grid shrink-0 place-items-center rounded-[3px] text-onyx [container-type:size] ${className}`}
      style={{ background: colorOf(profile.color) }}
    >
      <span className="text-[52cqmin] leading-none">{initialOf(profile.name)}</span>
    </span>
  );
}
