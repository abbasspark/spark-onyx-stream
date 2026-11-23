// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Folder of the subtitle files added to an asset, as they were converted.
 * Outside the generated output, so that it outlives processing.
 */
export function subtitlePrefix(assetId: string): string {
  return `subtitles/${assetId}`;
}
