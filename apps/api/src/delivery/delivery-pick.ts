// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';

export interface Candidate {
  id: string;
  weight: number;
}

/** Edges a video is spread over. More would thin out the copies each edge keeps. */
export const VIDEO_SPREAD = 2;

/**
 * Orders edges for one piece of content, the same way every time.
 *
 * This is weighted rendezvous hashing: every edge gets a score from the
 * content and its own id, and a higher weight lifts the score. The same video
 * therefore goes to the same edges, which keeps their copies useful, and when
 * an edge comes or goes only the content of that edge moves.
 */
export function rankFor(contentId: string, candidates: readonly Candidate[]): Candidate[] {
  return candidates
    .map((candidate) => ({ candidate, score: score(contentId, candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .map((entry) => entry.candidate);
}

function score(contentId: string, candidate: Candidate): number {
  const digest = createHash('sha256').update(`${contentId}:${candidate.id}`).digest();
  // A number in (0, 1), from the first 6 bytes.
  const unit = (digest.readUIntBE(0, 6) + 1) / (2 ** 48 + 2);
  return -Math.max(1, candidate.weight) / Math.log(unit);
}

/** Picks one candidate by chance, in proportion to the weights. */
export function pickByWeight<Item extends Candidate>(
  candidates: readonly Item[],
  random: number,
): Item | null {
  const total = candidates.reduce((sum, candidate) => sum + Math.max(1, candidate.weight), 0);
  let point = random * total;
  for (const candidate of candidates) {
    point -= Math.max(1, candidate.weight);
    if (point < 0) {
      return candidate;
    }
  }
  return candidates.at(-1) ?? null;
}

/**
 * The edge for one viewer.
 *
 * - A video goes to one of the few edges that keep it, so copies are reused.
 * - A live channel goes to any edge by weight: what is kept of it is small and
 *   short-lived, and a popular channel needs all of them.
 */
export function chooseEdge<Item extends Candidate>(
  kind: 'video' | 'live',
  contentId: string,
  candidates: readonly Item[],
  random: number = Math.random(),
): Item | null {
  if (candidates.length === 0) {
    return null;
  }
  if (kind === 'live') {
    return pickByWeight(candidates, random);
  }
  const ranked = rankFor(contentId, candidates).slice(0, VIDEO_SPREAD) as Item[];
  return pickByWeight(ranked, random);
}
