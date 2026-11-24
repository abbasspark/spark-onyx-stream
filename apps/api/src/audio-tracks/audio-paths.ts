// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Folder of the sound files added to an asset, as they came. Outside the
 * generated output, so that it outlives processing.
 */
export function audioPrefix(assetId: string): string {
  return `audio/${assetId}`;
}
