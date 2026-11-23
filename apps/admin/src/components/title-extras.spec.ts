// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { guessKind } from './title-extras';

describe('guessKind', () => {
  it('reads what a video is from its name', () => {
    expect(guessKind('Harbour Lights - Teaser 1')).toBe('TEASER');
    expect(guessKind('Making of Harbour Lights')).toBe('BEHIND_THE_SCENES');
    expect(guessKind('Interview with the director')).toBe('INTERVIEW');
    expect(guessKind('Outtakes')).toBe('BLOOPERS');
    expect(guessKind('Deleted scene 3')).toBe('CLIP');
    expect(guessKind('Featurette: the ferry')).toBe('FEATURETTE');
  });

  it('takes anything else for a trailer', () => {
    expect(guessKind('Harbour Lights (Official)')).toBe('TRAILER');
    expect(guessKind('')).toBe('TRAILER');
  });
});
