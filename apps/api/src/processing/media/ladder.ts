// SPDX-License-Identifier: AGPL-3.0-only

/** One output quality of an encoding profile. */
export interface ProfileRendition {
  name: string;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  videoCodec: string;
  audioCodec: string;
  preset: string;
  sortOrder: number;
}

/** A rendition as it will actually be encoded for one source. */
export interface PlannedRendition extends ProfileRendition {
  /** Output height. Never larger than the source. */
  height: number;
}

const HLS_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Picks the renditions to encode for a source of the given height.
 *
 * Renditions taller than the source are left out, so nothing is upscaled.
 * When every rendition is taller than the source, the smallest one is used at
 * the source's own height, so there is always something to play.
 *
 * The result is ordered from the highest quality down.
 *
 * @throws Error when the profile is empty or a name cannot be used in a file path.
 */
export function planRenditions(
  profile: readonly ProfileRendition[],
  sourceHeight: number,
): PlannedRendition[] {
  if (profile.length === 0) {
    throw new Error('The encoding profile has no renditions');
  }
  for (const rendition of profile) {
    if (!HLS_NAME_PATTERN.test(rendition.name)) {
      throw new Error(
        `Rendition name "${rendition.name}" may contain only letters, digits, dash and underscore`,
      );
    }
  }

  // libx264 with 4:2:0 color needs even dimensions.
  const evenSourceHeight = sourceHeight - (sourceHeight % 2);
  const byQuality = [...profile].sort(
    (a, b) => b.height - a.height || b.videoBitrate - a.videoBitrate,
  );
  const fitting = byQuality.filter((rendition) => rendition.height <= evenSourceHeight);

  if (fitting.length > 0) {
    return fitting;
  }

  const smallest = byQuality[byQuality.length - 1] as ProfileRendition;
  return [{ ...smallest, name: `${evenSourceHeight}p`, height: evenSourceHeight }];
}
